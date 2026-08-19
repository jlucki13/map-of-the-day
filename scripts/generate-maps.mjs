/**
 * Build-time generator for the curated THEMATIC map dataset.
 *
 * Renders a set of thematic maps from public-domain boundaries
 * (us-atlas / world-atlas → US Census TIGER + Natural Earth, both public
 * domain) driven by real public statistics, into self-hosted PNGs under
 * public/generated-maps/, and emits src/data/static-maps.json.
 *
 * Sixteen cartographic forms are supported, selected by `form` on each spec:
 *   choropleth    sequential colour ramp over polygons (the default)
 *   diverging     two ramps meeting at a midpoint, with a tick where they turn
 *   classed       quantile bins and a stepped legend instead of a smooth ramp
 *   symbol        circles at feature centroids, area-scaled by value
 *   point-symbol  the same, but at explicit lat/lon coordinates
 *   dot           dot density, N seeded dots rejection-sampled per polygon
 *   categorical   qualitative / binary classes with a discrete swatch legend
 *   tilegrid      equal-size square per state in a rough geographic grid
 *   points        located markers with no polygon shading at all
 *   flow          width-scaled arcs between origin-destination pairs
 *   bivariate     three-by-three colour matrix over two variables
 *   cartogram     each shape shrunk toward its centroid so area = value
 *   dorling       area-scaled circles relaxed apart until none overlap
 *   spike         a vertical needle per place, height linear in value
 *   composition   a pie per state on the tile grid, showing a three-way split
 *   surface       inverse-distance interpolation from point observations,
 *                 banded into zones and clipped to the land it describes
 *
 * Why generate our own: the "guess the topic" game needs thematic data maps,
 * and freely-licensed ones can't be fetched/verified from the build sandbox
 * (Wikimedia is network-blocked). Generating them ourselves gives CC0
 * licensing, pixel-exact redaction (we know exactly where the title is), and
 * a dataset that actually works offline in mock mode.
 *
 * Each map renders with its title visible (that PNG is the stored "original"
 * shown at reveal). For most forms the ONLY redacted region is the title band
 * at the top, because the legend is a bare numeric scale with no words — it
 * leaks nothing while still giving players a fair hint about magnitude.
 * The class-map forms (categorical / binary, and categorical tile grids) need
 * words in their legend, so they emit a SECOND redaction region covering just
 * the label strip: the swatches survive (the player still sees "this is a
 * three-class map") while the words that name the classes are covered.
 *
 * Dot-density placement uses a seeded PRNG keyed on the map id and the
 * feature name, so regenerating never churns the committed PNGs.
 *
 * Run manually after changing data/specs:  node scripts/generate-maps.mjs
 * (dev-only deps: d3-geo, d3-scale, d3-scale-chromatic, topojson-client,
 * us-atlas, world-atlas. sharp is already a runtime dep.)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geoPath, geoNaturalEarth1, geoAlbersUsa } from "d3-geo";
import { scaleSequential, scaleSequentialSqrt, scaleDiverging } from "d3-scale";
import * as chromatic from "d3-scale-chromatic";
import { feature } from "topojson-client";
import sharp from "sharp";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = join(__dirname, "..");
const OUT_IMG_DIR = join(REPO, "public", "generated-maps");
const OUT_JSON = join(REPO, "src", "data", "static-maps.json");
// Base64-embedded copy of each PNG, imported by the generation pipeline so it
// reads image bytes straight from the bundle instead of self-fetching over
// HTTP (a network self-fetch returns an HTML auth page under Vercel
// Deployment Protection, which sharp then rejects as a corrupt header).
const OUT_B64 = join(REPO, "src", "data", "generated-maps.b64.json");
const REPO_URL = "https://github.com/jlucki13/map-of-the-day";

const usTopo = JSON.parse(
  readFileSync(join(REPO, "node_modules", "us-atlas", "states-albers-10m.json")),
);
const worldTopo = JSON.parse(
  readFileSync(join(REPO, "node_modules", "world-atlas", "countries-110m.json")),
);

const usStates = feature(usTopo, usTopo.objects.states).features;
const worldCountries = feature(worldTopo, worldTopo.objects.countries).features;

// ---------------------------------------------------------------------------
// Datasets (real public statistics; keyed by the atlas feature name exactly).
// ---------------------------------------------------------------------------

// 2020 U.S. Census resident population.
const US_POPULATION = {
  California: 39538223, Texas: 29145505, Florida: 21538187, "New York": 20201249,
  Pennsylvania: 13002700, Illinois: 12812508, Ohio: 11799448, Georgia: 10711908,
  "North Carolina": 10439388, Michigan: 10077331, "New Jersey": 9288994,
  Virginia: 8631393, Washington: 7705281, Arizona: 7151502, Massachusetts: 7029917,
  Tennessee: 6910840, Indiana: 6785528, Maryland: 6177224, Missouri: 6154913,
  Wisconsin: 5893718, Colorado: 5773714, Minnesota: 5706494, "South Carolina": 5118425,
  Alabama: 5024279, Louisiana: 4657757, Kentucky: 4505836, Oregon: 4237256,
  Oklahoma: 3959353, Connecticut: 3605944, Utah: 3271616, Iowa: 3190369,
  Nevada: 3104614, Arkansas: 3011524, Mississippi: 2961279, Kansas: 2937880,
  "New Mexico": 2117522, Nebraska: 1961504, Idaho: 1839106, "West Virginia": 1793716,
  Hawaii: 1455271, "New Hampshire": 1377529, Maine: 1362359, "Rhode Island": 1097379,
  Montana: 1084225, Delaware: 989948, "South Dakota": 886667, "North Dakota": 779094,
  Alaska: 733391, "District of Columbia": 689545, Vermont: 643077, Wyoming: 576851,
};

// Land area (square miles).
const US_LAND_AREA = {
  Alaska: 570641, Texas: 261232, California: 155779, Montana: 145546,
  "New Mexico": 121298, Arizona: 113594, Nevada: 109781, Colorado: 103642,
  Wyoming: 97093, Oregon: 95988, Idaho: 82643, Utah: 82170, Kansas: 81759,
  Minnesota: 79627, Nebraska: 76824, "South Dakota": 75811, "North Dakota": 69001,
  Missouri: 68742, Oklahoma: 68595, Washington: 66456, Georgia: 57513,
  Michigan: 56539, Iowa: 55857, Illinois: 55519, Wisconsin: 54158, Florida: 53625,
  Arkansas: 52035, Alabama: 50645, "North Carolina": 48618, "New York": 47126,
  Mississippi: 46923, Pennsylvania: 44743, Louisiana: 43204, Tennessee: 41235,
  Ohio: 40861, Virginia: 39490, Kentucky: 39486, Indiana: 35826, Maine: 30843,
  "South Carolina": 30061, "West Virginia": 24038, Maryland: 9707, Vermont: 9217,
  "New Hampshire": 8953, Massachusetts: 7800, "New Jersey": 7354, Hawaii: 6423,
  Connecticut: 4842, Delaware: 1949, "Rhode Island": 1034, "District of Columbia": 61,
};

// Order of admission to the Union (1 = first).
const US_STATEHOOD_ORDER = {
  Delaware: 1, Pennsylvania: 2, "New Jersey": 3, Georgia: 4, Connecticut: 5,
  Massachusetts: 6, Maryland: 7, "South Carolina": 8, "New Hampshire": 9,
  Virginia: 10, "New York": 11, "North Carolina": 12, "Rhode Island": 13,
  Vermont: 14, Kentucky: 15, Tennessee: 16, Ohio: 17, Louisiana: 18, Indiana: 19,
  Mississippi: 20, Illinois: 21, Alabama: 22, Maine: 23, Missouri: 24, Arkansas: 25,
  Michigan: 26, Florida: 27, Texas: 28, Iowa: 29, Wisconsin: 30, California: 31,
  Minnesota: 32, Oregon: 33, Kansas: 34, "West Virginia": 35, Nevada: 36,
  Nebraska: 37, Colorado: 38, "North Dakota": 39, "South Dakota": 40, Montana: 41,
  Washington: 42, Idaho: 43, Wyoming: 44, Utah: 45, Oklahoma: 46, "New Mexico": 47,
  Arizona: 48, Alaska: 49, Hawaii: 50,
};

// Electoral votes (2024 election, post-2020 apportionment).
const US_ELECTORAL = {
  California: 54, Texas: 40, Florida: 30, "New York": 28, Pennsylvania: 19,
  Illinois: 19, Ohio: 17, Georgia: 16, "North Carolina": 16, Michigan: 15,
  "New Jersey": 14, Virginia: 13, Washington: 12, Arizona: 11, Indiana: 11,
  Massachusetts: 11, Tennessee: 11, Maryland: 10, Missouri: 10, Wisconsin: 10,
  Colorado: 10, Minnesota: 10, "South Carolina": 9, Alabama: 9, Louisiana: 8,
  Kentucky: 8, Oregon: 8, Oklahoma: 7, Connecticut: 7, Utah: 6, Iowa: 6, Nevada: 6,
  Arkansas: 6, Mississippi: 6, Kansas: 6, "New Mexico": 5, Nebraska: 5, Idaho: 4,
  "West Virginia": 4, Hawaii: 4, "New Hampshire": 4, Maine: 4, "Rhode Island": 4,
  Montana: 4, Delaware: 3, "South Dakota": 3, "North Dakota": 3, Alaska: 3,
  Vermont: 3, Wyoming: 3, "District of Columbia": 3,
};

// Number of counties (or county-equivalents: LA parishes, AK boroughs/census
// areas, VA independent cities, MD/MO/NV independent cities).
const US_COUNTIES = {
  Texas: 254, Georgia: 159, Virginia: 133, Kentucky: 120, Missouri: 115,
  Kansas: 105, Illinois: 102, "North Carolina": 100, Iowa: 99, Tennessee: 95,
  Nebraska: 93, Indiana: 92, Ohio: 88, Minnesota: 87, Michigan: 83, Mississippi: 82,
  Oklahoma: 77, Arkansas: 75, Wisconsin: 72, Pennsylvania: 67, Alabama: 67,
  Florida: 67, "South Dakota": 66, Louisiana: 64, Colorado: 64, "New York": 62,
  California: 58, Montana: 56, "West Virginia": 55, "North Dakota": 53,
  "South Carolina": 46, Idaho: 44, Washington: 39, Oregon: 36, "New Mexico": 33,
  Utah: 29, Maryland: 24, Alaska: 30, Wyoming: 23, "New Jersey": 21, Nevada: 17,
  Maine: 16, Arizona: 15, Vermont: 14, Massachusetts: 14, "New Hampshire": 10,
  Connecticut: 8, "Rhode Island": 5, Hawaii: 5, Delaware: 3,
};

// Highest elevation point (feet above sea level).
const US_ELEVATION = {
  Alaska: 20310, California: 14505, Colorado: 14440, Washington: 14411,
  Wyoming: 13809, Hawaii: 13803, Utah: 13534, "New Mexico": 13161, Nevada: 13147,
  Montana: 12799, Idaho: 12662, Arizona: 12633, Oregon: 11249, Texas: 8751,
  "South Dakota": 7242, "North Carolina": 6684, Tennessee: 6643,
  "New Hampshire": 6288, Virginia: 5729, Nebraska: 5424, "New York": 5344,
  Maine: 5268, Oklahoma: 4975, "West Virginia": 4863, Georgia: 4784, Vermont: 4393,
  Kentucky: 4145, Kansas: 4041, "South Carolina": 3560, "North Dakota": 3506,
  Massachusetts: 3489, Maryland: 3360, Pennsylvania: 3213, Arkansas: 2753,
  Alabama: 2413, Connecticut: 2380, Minnesota: 2301, Michigan: 1979, Wisconsin: 1951,
  "New Jersey": 1803, Missouri: 1772, Iowa: 1670, Ohio: 1550, Indiana: 1257,
  Illinois: 1235, "Rhode Island": 812, Mississippi: 807, "District of Columbia": 409,
  Louisiana: 535, Delaware: 448, Florida: 345,
};

// Median household income (US dollars), 2022 American Community Survey.
const US_MEDIAN_INCOME = {
  "District of Columbia": 101722, Maryland: 98461, Massachusetts: 96505,
  "New Jersey": 96346, Hawaii: 94814, California: 91905, "New Hampshire": 90845,
  Washington: 90325, Connecticut: 90213, Colorado: 87598, Virginia: 87249,
  Utah: 86833, Alaska: 86370, Minnesota: 84313, "New York": 81386,
  "Rhode Island": 81370, Delaware: 79325, Illinois: 78433, Oregon: 76632,
  Vermont: 74014, "North Dakota": 73959, Pennsylvania: 73170, Texas: 73035,
  Arizona: 72581, Wisconsin: 72458, Wyoming: 72495, Nebraska: 71722,
  Nevada: 71646, Georgia: 71355, Iowa: 70571, Idaho: 70214, Kansas: 69747,
  "South Dakota": 69457, Florida: 67917, Maine: 68251, Indiana: 67173,
  Ohio: 66990, Michigan: 66986, Montana: 66341, "North Carolina": 66186,
  Missouri: 65920, Tennessee: 65254, "South Carolina": 63623, Oklahoma: 61364,
  Kentucky: 60183, Alabama: 59609, "New Mexico": 58722, Louisiana: 57852,
  Arkansas: 55432, "West Virginia": 55217, Mississippi: 52719,
};

// Average annual snowfall (inches) — approximate statewide averages from NOAA
// climate normals.
const US_SNOWFALL = {
  Vermont: 89, Maine: 78, Wyoming: 77, "New Hampshire": 71, Colorado: 67,
  Alaska: 64, Michigan: 61, "New York": 56, "North Dakota": 51,
  Massachusetts: 51, Utah: 48, Wisconsin: 47, Minnesota: 46, Idaho: 45,
  Pennsylvania: 42, Connecticut: 40, "South Dakota": 38, Montana: 38,
  "Rhode Island": 33, Ohio: 32, "West Virginia": 31, Iowa: 30, Nebraska: 26,
  "New Jersey": 24, Indiana: 24, Illinois: 22, Nevada: 21, Maryland: 20,
  Kansas: 17, Oregon: 16, Missouri: 15, Delaware: 15, Virginia: 14,
  "District of Columbia": 14, Kentucky: 13, Washington: 12, "New Mexico": 12,
  Oklahoma: 7, Arizona: 6, "North Carolina": 5, Tennessee: 5, Arkansas: 5,
  California: 4, Texas: 2, "South Carolina": 1.5, Georgia: 1.5, Alabama: 1,
  Mississippi: 1, Louisiana: 0.4, Florida: 0.1, Hawaii: 0.1,
};

// Share of the state's land area classified as forest land (percent),
// approximate USDA Forest Service Forest Inventory & Analysis figures.
const US_FOREST = {
  Maine: 89, "New Hampshire": 84, "West Virginia": 79, Vermont: 78,
  Alabama: 71, "South Carolina": 68, Georgia: 67, Mississippi: 65,
  "New York": 63, Virginia: 62, Massachusetts: 60, Connecticut: 59,
  "North Carolina": 59, Pennsylvania: 59, Michigan: 56, Arkansas: 56,
  "Rhode Island": 54, Tennessee: 52, Louisiana: 52, Washington: 52,
  Florida: 51, Wisconsin: 49, Kentucky: 49, Oregon: 48, "New Jersey": 45,
  Hawaii: 42, Idaho: 40, Maryland: 39, Texas: 37, Utah: 35, Colorado: 35,
  Missouri: 35, Alaska: 35, Minnesota: 34, California: 33, Ohio: 31,
  Delaware: 30, "New Mexico": 30, Oklahoma: 28, Montana: 27, Arizona: 26,
  Indiana: 21, "District of Columbia": 20, Wyoming: 18, Nevada: 15,
  Illinois: 14, Iowa: 8, Kansas: 5, "South Dakota": 4, Nebraska: 3,
  "North Dakota": 2,
};

// Average daily low temperature in January (degrees Fahrenheit) — approximate
// statewide averages from NOAA 1991-2020 climate normals.
const US_JAN_LOW = {
  Hawaii: 66, Florida: 51, Louisiana: 40, California: 39, Texas: 36,
  Arizona: 36, Mississippi: 35, "South Carolina": 35, Alabama: 34, Georgia: 34,
  Oregon: 32, "North Carolina": 30, Arkansas: 30, Washington: 30,
  "District of Columbia": 29, Tennessee: 28, Oklahoma: 27, Virginia: 27,
  Kentucky: 26, Delaware: 26, Nevada: 25, Maryland: 25, "New Jersey": 25,
  "West Virginia": 23, Missouri: 22, Ohio: 22, "Rhode Island": 22,
  "New Mexico": 22, Kansas: 21, Indiana: 21, Pennsylvania: 21, Connecticut: 21,
  Illinois: 20, Massachusetts: 20, Utah: 20, Idaho: 20, Colorado: 17,
  Nebraska: 17, Michigan: 17, "New York": 16, Iowa: 14, Wyoming: 13,
  Montana: 13, "South Dakota": 11, "New Hampshire": 11, Wisconsin: 9,
  Vermont: 9, Maine: 7, Minnesota: 4, "North Dakota": 2, Alaska: -8,
};

// Effective state minimum wage in 2024 (US dollars per hour). States with no
// higher state standard are shown at the federal minimum of $7.25.
const US_MIN_WAGE = {
  "District of Columbia": 17.5, Washington: 16.28, California: 16.0,
  Connecticut: 15.69, "New Jersey": 15.13, "New York": 15.0,
  Massachusetts: 15.0, Maryland: 15.0, Colorado: 14.42, Arizona: 14.35,
  Oregon: 14.2, Maine: 14.15, "Rhode Island": 14.0, Illinois: 14.0,
  Hawaii: 14.0, Vermont: 13.67, Delaware: 13.25, Missouri: 12.3,
  Nebraska: 12.0, Virginia: 12.0, Florida: 12.0, Nevada: 12.0,
  "New Mexico": 12.0, Alaska: 11.73, "South Dakota": 11.2, Arkansas: 11.0,
  Minnesota: 10.85, Ohio: 10.45, Michigan: 10.33, Montana: 10.3,
  "West Virginia": 8.75, Wisconsin: 7.25, Pennsylvania: 7.25, Indiana: 7.25,
  Iowa: 7.25, Kansas: 7.25, Kentucky: 7.25, "New Hampshire": 7.25,
  "North Carolina": 7.25, "North Dakota": 7.25, Oklahoma: 7.25,
  "South Carolina": 7.25, Texas: 7.25, Utah: 7.25, Idaho: 7.25, Georgia: 7.25,
  Wyoming: 7.25, Alabama: 7.25, Mississippi: 7.25, Louisiana: 7.25,
  Tennessee: 7.25,
};

// Mean travel time to work, in minutes (2022 American Community Survey).
const US_COMMUTE = {
  "New York": 33.3, Maryland: 33.0, "New Jersey": 31.7, "District of Columbia": 30.5,
  Massachusetts: 29.9, Illinois: 28.6, California: 28.5, Virginia: 28.4,
  Georgia: 28.3, Florida: 27.6, Hawaii: 27.6, Washington: 27.4,
  "New Hampshire": 27.2, Pennsylvania: 27.0, Delaware: 26.6, Texas: 26.6,
  Connecticut: 26.5, "West Virginia": 26.4, Louisiana: 25.7,
  "South Carolina": 25.6, Tennessee: 25.6, Alabama: 25.4, Colorado: 25.4,
  "Rhode Island": 25.4, Arizona: 25.4, Mississippi: 25.3,
  "North Carolina": 25.1, Nevada: 25.0, Michigan: 24.8, Maine: 24.5,
  Oregon: 24.4, Indiana: 24.1, Kentucky: 23.9, Missouri: 23.9, Minnesota: 23.9,
  Ohio: 23.7, Vermont: 23.1, Oklahoma: 22.4, "New Mexico": 22.4,
  Arkansas: 22.3, Wisconsin: 22.2, Utah: 22.1, Idaho: 21.5, Kansas: 19.7,
  Iowa: 19.6, Alaska: 19.6, Montana: 18.9, Nebraska: 18.7, Wyoming: 17.9,
  "North Dakota": 17.6, "South Dakota": 17.4,
};

// Life expectancy at birth, in years (CDC/NCHS state estimates for 2020).
const US_LIFE_EXPECTANCY = {
  Hawaii: 80.7, Washington: 79.2, Minnesota: 79.1, California: 79.0,
  Massachusetts: 79.0, "New Hampshire": 79.0, Oregon: 78.8, Vermont: 78.8,
  Utah: 78.6, Connecticut: 78.4, Idaho: 78.4, Colorado: 78.3,
  "New Jersey": 78.2, Nebraska: 78.2, "Rhode Island": 78.2, Wisconsin: 78.1,
  Iowa: 78.0, Maine: 77.9, "North Dakota": 77.9, "New York": 77.7,
  Virginia: 77.6, Florida: 77.5, Maryland: 77.0, Illinois: 77.0,
  Pennsylvania: 77.0, Montana: 76.9, Kansas: 76.9, Delaware: 76.7,
  Alaska: 76.6, "South Dakota": 76.6, Texas: 76.5, Michigan: 76.5,
  Wyoming: 76.5, Arizona: 76.3, Nevada: 76.3, "North Carolina": 76.1,
  "District of Columbia": 76.0, Missouri: 75.7, Georgia: 75.6, Indiana: 75.6,
  "South Carolina": 75.4, Ohio: 75.3, "New Mexico": 74.5, Oklahoma: 74.1,
  Kentucky: 74.0, Arkansas: 73.8, Tennessee: 73.8, Alabama: 73.2,
  Louisiana: 73.1, "West Virginia": 72.8, Mississippi: 71.9,
};

// Share of in-state utility-scale electricity net generation that comes from
// wind (percent), approximate 2023 EIA figures.
const US_WIND_SHARE = {
  Iowa: 59, "South Dakota": 55, Kansas: 47, Oklahoma: 41, "North Dakota": 36,
  "New Mexico": 32, Nebraska: 30, Colorado: 29, Minnesota: 24, Texas: 22,
  Wyoming: 22, Maine: 21, Montana: 15, Idaho: 15, Vermont: 13, Illinois: 12,
  Oregon: 12, Indiana: 10, Missouri: 8, Michigan: 8, California: 7,
  Washington: 7, Hawaii: 6, "New York": 4, "West Virginia": 4, Wisconsin: 3,
  Pennsylvania: 3, Utah: 3, Maryland: 3, "New Hampshire": 3, "Rhode Island": 3,
  Ohio: 2, Arizona: 2, Alaska: 2, "New Jersey": 1.4, Massachusetts: 1.4,
  Nevada: 1, "North Carolina": 0.9, Delaware: 0.3, Tennessee: 0.3,
  Connecticut: 0.2, Virginia: 0.1, Alabama: 0, Arkansas: 0, Florida: 0,
  Georgia: 0, Kentucky: 0, Louisiana: 0, Mississippi: 0, "South Carolina": 0,
  "District of Columbia": 0,
};

// Corn for grain production, in millions of bushels (approximate 2023 USDA
// NASS figures). States with no reported corn-for-grain crop are omitted.
const US_CORN = {
  Iowa: 2545, Illinois: 2255, Nebraska: 1795, Minnesota: 1585, Indiana: 1120,
  "South Dakota": 850, Kansas: 765, Ohio: 680, Missouri: 595, Wisconsin: 555,
  Michigan: 400, "North Dakota": 400, Texas: 320, Kentucky: 250,
  Colorado: 175, Pennsylvania: 165, "North Carolina": 130, Mississippi: 130,
  Tennessee: 130, Arkansas: 105, "New York": 100, Louisiana: 85, Georgia: 60,
  Virginia: 55, Oklahoma: 55, Maryland: 45, "South Carolina": 45,
  Alabama: 40, Delaware: 30, Washington: 30, Idaho: 30, California: 30,
  Montana: 25, "New Mexico": 25, Wyoming: 20, Oregon: 10, Arizona: 10,
  "New Jersey": 9, Utah: 8, Florida: 5, "West Virginia": 4,
};

// ~2020 population by country (millions).
const WORLD_POPULATION = {
  China: 1411, India: 1380, "United States of America": 331, Indonesia: 274,
  Pakistan: 221, Brazil: 213, Nigeria: 206, Bangladesh: 165, Russia: 146,
  Mexico: 129, Japan: 126, Ethiopia: 115, Philippines: 110, Egypt: 102,
  Vietnam: 97, "Dem. Rep. Congo": 90, Iran: 84, Turkey: 84, Germany: 83,
  Thailand: 70, "United Kingdom": 67, France: 65, Italy: 60, Tanzania: 60,
  "South Africa": 59, Myanmar: 54, Kenya: 54, "South Korea": 52, Colombia: 51,
  Spain: 47, Uganda: 46, Argentina: 45, Ukraine: 44, Algeria: 44, Sudan: 44,
  Iraq: 40, Afghanistan: 39, Poland: 38, Canada: 38, Morocco: 37,
  "Saudi Arabia": 35, Uzbekistan: 34, Peru: 33, Angola: 33, Malaysia: 32,
  Mozambique: 31, Ghana: 31, Yemen: 30, Nepal: 29, Venezuela: 28, Madagascar: 28,
  Cameroon: 27, "Côte d'Ivoire": 26, "North Korea": 26, Australia: 26, Niger: 24,
  "Sri Lanka": 22, "Burkina Faso": 21, Mali: 20, Romania: 19, Malawi: 19,
  Chile: 19, Kazakhstan: 19, Zambia: 18, Guatemala: 18, Ecuador: 18, Syria: 17,
  Netherlands: 17, Senegal: 17, Cambodia: 17, Chad: 16, Somalia: 16, Zimbabwe: 15,
  Guinea: 13, Rwanda: 13, Benin: 12, Burundi: 12, Tunisia: 12, Bolivia: 12,
  Belgium: 12, Haiti: 11, Cuba: 11, "S. Sudan": 11, "Dominican Rep.": 11,
  Czechia: 11, Greece: 10, Portugal: 10, Sweden: 10, Azerbaijan: 10, Hungary: 10,
  "United Arab Emirates": 10, Belarus: 9, Israel: 9, Austria: 9, "Papua New Guinea": 9,
  Switzerland: 9, "Sierra Leone": 8, Togo: 8, Laos: 7, Paraguay: 7, Libya: 7,
  Jordan: 10, Serbia: 7, Bulgaria: 7, Nicaragua: 7, "Central African Rep.": 5,
  Norway: 5, Finland: 6, Denmark: 6, Slovakia: 5, Turkmenistan: 6, Ireland: 5,
  "New Zealand": 5, "Costa Rica": 5, Liberia: 5, Mauritania: 5, Panama: 4,
  Croatia: 4, Georgia: 4, Uruguay: 3, Mongolia: 3, Armenia: 3, Albania: 3,
  Lithuania: 3, Namibia: 3, Botswana: 2, Gabon: 2, Lesotho: 2, "Guinea-Bissau": 2,
  Latvia: 2, Slovenia: 2, "Eq. Guinea": 1, "Timor-Leste": 1, Estonia: 1,
  Bhutan: 1, Djibouti: 1, Fiji: 1, Cyprus: 1, "Bosnia and Herz.": 3, Oman: 5,
  Kuwait: 4, Qatar: 3, Lebanon: 7, Moldova: 3, Kyrgyzstan: 6, Tajikistan: 9,
  Honduras: 10, "El Salvador": 6,
};

// Land area by country (thousand km²).
const WORLD_AREA = {
  Russia: 17098, Canada: 9985, "United States of America": 9834, China: 9597,
  Brazil: 8516, Australia: 7692, India: 3287, Argentina: 2780, Kazakhstan: 2725,
  Algeria: 2382, "Dem. Rep. Congo": 2345, Greenland: 2166, "Saudi Arabia": 2150,
  Mexico: 1964, Indonesia: 1905, Sudan: 1861, Libya: 1760, Iran: 1648,
  Mongolia: 1564, Peru: 1285, Chad: 1284, Niger: 1267, Angola: 1247, Mali: 1240,
  "South Africa": 1221, Colombia: 1142, Ethiopia: 1104, Bolivia: 1099,
  Mauritania: 1031, Egypt: 1002, Tanzania: 947, Nigeria: 924, Venezuela: 916,
  Namibia: 825, Mozambique: 802, Pakistan: 796, Turkey: 784, Chile: 756,
  Zambia: 753, Myanmar: 677, Afghanistan: 653, "S. Sudan": 644, Somalia: 638,
  "Central African Rep.": 623, Ukraine: 604, Madagascar: 587, Botswana: 582,
  Kenya: 580, France: 552, Yemen: 528, Thailand: 513, Spain: 506, Turkmenistan: 488,
  Cameroon: 475, "Papua New Guinea": 463, Sweden: 450, Uzbekistan: 447,
  Morocco: 447, Iraq: 438, Paraguay: 407, Zimbabwe: 391, Japan: 378, Germany: 357,
  Congo: 342, Finland: 338, Vietnam: 331, Malaysia: 330, Norway: 324,
  "Côte d'Ivoire": 322, Poland: 313, Oman: 310, Italy: 301, Philippines: 300,
  "Burkina Faso": 274, "New Zealand": 268, Gabon: 268, Ecuador: 256, Guinea: 246,
  "United Kingdom": 244, Uganda: 241, Ghana: 239, Romania: 238, Laos: 237,
  Guyana: 215, Belarus: 208, Kyrgyzstan: 200, Senegal: 197, Syria: 185,
  Cambodia: 181, Uruguay: 176, Suriname: 164, Tunisia: 164, Bangladesh: 148,
  Nepal: 147, Greece: 132, Nicaragua: 130, "North Korea": 121, Malawi: 118,
  Eritrea: 118, Benin: 115, Honduras: 112, Liberia: 111, Bulgaria: 111, Cuba: 110,
  Guatemala: 109, Iceland: 103, "South Korea": 100, Hungary: 93, Portugal: 92,
  Jordan: 89, Serbia: 88, Azerbaijan: 87, Austria: 84, "United Arab Emirates": 84,
  Czechia: 79, Panama: 75, "Sierra Leone": 72, Ireland: 70, Georgia: 70,
  "Sri Lanka": 66, Lithuania: 65, Latvia: 65, Togo: 57, Croatia: 57,
  "Bosnia and Herz.": 51, "Costa Rica": 51, Slovakia: 49, "Dominican Rep.": 49,
  Estonia: 45, Denmark: 43, Netherlands: 42, Switzerland: 41, Bhutan: 38,
  "Guinea-Bissau": 36, Moldova: 34, Belgium: 31, Lesotho: 30, Armenia: 30,
  Albania: 29, "Eq. Guinea": 28, Burundi: 28, Haiti: 28, Rwanda: 26, Macedonia: 26,
  Djibouti: 23, Belize: 23, Israel: 22, "El Salvador": 21, Slovenia: 20, Fiji: 18,
  Kuwait: 18, "Timor-Leste": 15, Montenegro: 14, Lebanon: 10, Cyprus: 9,
  Qatar: 12, Gambia: 11, Vanuatu: 12, Brunei: 6,
};

// GDP per capita, current US dollars, approximate 2022 World Bank figures
// (values for a few closed or crisis economies are rough order-of-magnitude
// estimates). Countries with no comparable figure render unshaded.
const WORLD_GDP_PC = {
  Luxembourg: 125000, Norway: 108000, Ireland: 104000, Switzerland: 93000,
  Qatar: 88000, "United States of America": 76000, Iceland: 74000,
  Denmark: 68000, Australia: 65000, Netherlands: 57000, Sweden: 56000,
  Canada: 55000, Israel: 54000, "United Arab Emirates": 53000, Austria: 52000,
  Finland: 51000, Belgium: 49000, Germany: 48000, "New Zealand": 48000,
  "United Kingdom": 46000, France: 41000, Kuwait: 41000, Brunei: 37000,
  Japan: 34000, Italy: 34000, Cyprus: 33000, "South Korea": 32000,
  Taiwan: 32000, Bahamas: 31000, Spain: 30000, "Saudi Arabia": 30000,
  Slovenia: 29000, Estonia: 28000, Czechia: 27000, Oman: 25000,
  Lithuania: 25000, Portugal: 24000, Slovakia: 21000, Latvia: 21000,
  Greece: 21000, Uruguay: 21000, Poland: 18000, Hungary: 18000,
  "Trinidad and Tobago": 18000, Croatia: 17000, Panama: 17000, Chile: 15000,
  Romania: 15000, Russia: 15000, Argentina: 13600, Bulgaria: 13000,
  China: 12700, "Costa Rica": 12500, Malaysia: 12000, Mexico: 11500,
  Kazakhstan: 11500, Turkey: 10600, "Dominican Rep.": 10100,
  Montenegro: 10000, Cuba: 9500, Serbia: 9500, Gabon: 8800, "Eq. Guinea": 8500,
  Turkmenistan: 8500, Brazil: 8900, Belarus: 7800, Azerbaijan: 7700,
  Botswana: 7700, "Bosnia and Herz.": 7600, Peru: 7100, Armenia: 7000,
  Macedonia: 7000, Thailand: 7000, Albania: 6800, "South Africa": 6800,
  Georgia: 6700, Libya: 6700, Colombia: 6600, Belize: 6600, Ecuador: 6400,
  Iraq: 5900, Suriname: 5900, Moldova: 5600, Guatemala: 5500, Kosovo: 5300,
  Fiji: 5300, "El Salvador": 5100, Mongolia: 5000, Namibia: 4900,
  Indonesia: 4800, Jordan: 4700, Ukraine: 4500, Iran: 4400, Algeria: 4300,
  Egypt: 4300, Vietnam: 4200, eSwatini: 4100, Palestine: 3800, Tunisia: 3800,
  Bolivia: 3600, Bhutan: 3600, Morocco: 3500, Philippines: 3500,
  "Sri Lanka": 3500, Djibouti: 3500, Venezuela: 3500, Vanuatu: 3200,
  Honduras: 3200, Angola: 3000, "Côte d'Ivoire": 2600, Congo: 2500,
  "Timor-Leste": 2400, India: 2400, Uzbekistan: 2300, Nicaragua: 2300,
  Ghana: 2200, Nigeria: 2200, Mauritania: 2200, "Solomon Is.": 2200,
  Kenya: 2100, Laos: 2100, Cambodia: 1800, Haiti: 1700, Zimbabwe: 1700,
  Pakistan: 1600, Senegal: 1600, Cameroon: 1600, Guinea: 1500, Zambia: 1400,
  Benin: 1400, Nepal: 1300, Myanmar: 1200, Tanzania: 1200, Ethiopia: 1100,
  Sudan: 1100, Lesotho: 1100, Rwanda: 1000, Uganda: 1000, Togo: 1000,
  Mali: 900, "Burkina Faso": 900, Gambia: 850, "Guinea-Bissau": 800,
  Liberia: 800, Chad: 700, Yemen: 700, Eritrea: 650, "Dem. Rep. Congo": 650,
  Malawi: 650, Somalia: 600, Niger: 600, Mozambique: 550, Madagascar: 500,
  "Central African Rep.": 500, "Sierra Leone": 500, Afghanistan: 400,
  "S. Sudan": 400, Burundi: 240, Bangladesh: 2700, "Papua New Guinea": 2700,
  Paraguay: 6200, Jamaica: 6000, Guyana: 18400, Syria: 900, Lebanon: 4100,
  "North Korea": 1200, Greenland: 57000, "Puerto Rico": 35000,
  "New Caledonia": 37000, Kyrgyzstan: 1700, Tajikistan: 1100,
};

// Urban share of the population (percent), approximate 2022 World Bank figures.
const WORLD_URBAN = {
  Kuwait: 100, Qatar: 99, Belgium: 98, Uruguay: 96, Iceland: 94,
  "Puerto Rico": 94, Netherlands: 93, Israel: 93, Japan: 92, Argentina: 92,
  Jordan: 92, Luxembourg: 92, Lebanon: 89, Chile: 88, Denmark: 88, Sweden: 88,
  Venezuela: 88, Oman: 88, Brazil: 87, "United Arab Emirates": 87,
  "New Zealand": 87, Australia: 86, Finland: 86, "United Kingdom": 84,
  "Saudi Arabia": 84, "Dominican Rep.": 84, "United States of America": 83,
  Norway: 83, Bahamas: 83, "Costa Rica": 82, Colombia: 82, Canada: 82,
  Mexico: 81, Spain: 81, France: 81, Libya: 81, "South Korea": 81, Greece: 80,
  Taiwan: 80, Belarus: 80, Brunei: 79, Germany: 78, Peru: 78, Malaysia: 78,
  Djibouti: 78, Turkey: 77, Iran: 77, Cuba: 77, Palestine: 77, Russia: 75,
  Algeria: 75, "El Salvador": 75, Czechia: 74, Switzerland: 74,
  "Eq. Guinea": 74, Bulgaria: 76, Botswana: 72, "New Caledonia": 72,
  Hungary: 72, Iraq: 71, Italy: 71, Bolivia: 71, Tunisia: 70, Ukraine: 70,
  Estonia: 69, Mongolia: 69, Panama: 69, Angola: 68, Congo: 68,
  "South Africa": 68, Montenegro: 68, Latvia: 68, Lithuania: 68, Cyprus: 67,
  Portugal: 67, Suriname: 66, Morocco: 65, Ecuador: 65, Ireland: 64,
  Albania: 64, Armenia: 63, Gambia: 63, China: 63, "North Korea": 63,
  Paraguay: 63, Poland: 60, Honduras: 60, Georgia: 60, Austria: 59,
  Macedonia: 59, Haiti: 59, Nicaragua: 59, Indonesia: 58, Cameroon: 58,
  Ghana: 58, Fiji: 58, Croatia: 58, Kazakhstan: 58, Serbia: 57,
  Azerbaijan: 57, Jamaica: 57, Mauritania: 57, Syria: 56, Slovenia: 55,
  Romania: 54, Slovakia: 54, Nigeria: 53, Thailand: 53, Turkmenistan: 53,
  Namibia: 53, Liberia: 53, "Trinidad and Tobago": 53, Guatemala: 53,
  "Côte d'Ivoire": 52, Uzbekistan: 50, Benin: 49, Senegal: 49,
  "Bosnia and Herz.": 49, Philippines: 48, Somalia: 47, "Dem. Rep. Congo": 47,
  Belize: 46, "Guinea-Bissau": 45, Mali: 45, Zambia: 45, "Sierra Leone": 44,
  Bhutan: 44, Egypt: 43, Togo: 43, "Central African Rep.": 43, Moldova: 43,
  Kosovo: 43, Eritrea: 42, Madagascar: 40, Bangladesh: 39, Vietnam: 39,
  Yemen: 39, Guinea: 38, Mozambique: 38, Pakistan: 38, Kyrgyzstan: 37,
  Laos: 37, Sudan: 36, Tanzania: 36, India: 35, Myanmar: 32, Zimbabwe: 32,
  "Burkina Faso": 32, "Timor-Leste": 32, Lesotho: 30, Kenya: 29,
  Tajikistan: 28, Guyana: 27, Afghanistan: 26, Uganda: 26, Cambodia: 25,
  "Solomon Is.": 26, Vanuatu: 26, Chad: 24, eSwatini: 24, Ethiopia: 23,
  Nepal: 21, "S. Sudan": 21, "Sri Lanka": 19, Rwanda: 18, Malawi: 18,
  Niger: 17, Burundi: 14, "Papua New Guinea": 13, Gabon: 90, Greenland: 87,
};

// Total fertility rate — births per woman — approximate 2021 World Bank
// figures.
const WORLD_FERTILITY = {
  Niger: 6.8, Chad: 6.3, Somalia: 6.3, "Dem. Rep. Congo": 6.2,
  "Central African Rep.": 6.0, Mali: 6.0, Angola: 5.3, Nigeria: 5.2,
  Burundi: 5.2, Benin: 5.0, "Burkina Faso": 4.8, Tanzania: 4.7,
  Afghanistan: 4.6, Mozambique: 4.6, Gambia: 4.6, Uganda: 4.5, Cameroon: 4.5,
  "S. Sudan": 4.5, Guinea: 4.4, Sudan: 4.4, "Côte d'Ivoire": 4.4,
  Mauritania: 4.4, Senegal: 4.3, Zambia: 4.3, Togo: 4.2, Congo: 4.2,
  "Eq. Guinea": 4.2, Ethiopia: 4.1, Liberia: 4.1, "Guinea-Bissau": 4.0,
  "Sierra Leone": 4.0, Eritrea: 4.0, "Solomon Is.": 4.0, Malawi: 3.9,
  Rwanda: 3.8, Yemen: 3.8, Vanuatu: 3.8, Madagascar: 3.7, Ghana: 3.6,
  Palestine: 3.6, Gabon: 3.5, Zimbabwe: 3.5, Iraq: 3.5, Pakistan: 3.5,
  Kenya: 3.3, Namibia: 3.3, Uzbekistan: 3.3, Tajikistan: 3.2,
  "Papua New Guinea": 3.2, "Timor-Leste": 3.1, Lesotho: 3.0, Kyrgyzstan: 3.0,
  Kazakhstan: 3.0, eSwatini: 2.9, Egypt: 2.9, Algeria: 2.9, Israel: 2.9,
  Botswana: 2.8, Jordan: 2.8, Haiti: 2.8, Mongolia: 2.8, Syria: 2.8,
  Turkmenistan: 2.7, Philippines: 2.7, Oman: 2.6, Bolivia: 2.6, Laos: 2.5,
  Paraguay: 2.5, "South Africa": 2.4, Libya: 2.4, Guatemala: 2.4,
  Honduras: 2.4, "Saudi Arabia": 2.4, Guyana: 2.4, Suriname: 2.4, Fiji: 2.4,
  Morocco: 2.3, Cambodia: 2.3, Panama: 2.3, Nicaragua: 2.3,
  "Dominican Rep.": 2.3, Indonesia: 2.2, Myanmar: 2.2, Peru: 2.2,
  Venezuela: 2.2, Tunisia: 2.1, Lebanon: 2.1, Kuwait: 2.1, India: 2.0,
  Bangladesh: 2.0, Nepal: 2.0, "Sri Lanka": 2.0, Ecuador: 2.0, Belize: 2.0,
  Georgia: 2.0, Vietnam: 1.9, Argentina: 1.9, Turkey: 1.9, "New Caledonia": 1.9,
  Malaysia: 1.8, Mexico: 1.8, "North Korea": 1.8, Brunei: 1.8, France: 1.8,
  Ireland: 1.8, Czechia: 1.8, Romania: 1.8, Moldova: 1.8, Qatar: 1.8,
  "El Salvador": 1.8, "United States of America": 1.7, Denmark: 1.7,
  Sweden: 1.7, Iceland: 1.7, Colombia: 1.7, Montenegro: 1.7, Kosovo: 1.7,
  Iran: 1.7, Azerbaijan: 1.7, Australia: 1.7, "New Zealand": 1.7,
  "United Kingdom": 1.6, Netherlands: 1.6, Belgium: 1.6, Norway: 1.6,
  Estonia: 1.6, Latvia: 1.6, Slovakia: 1.6, Hungary: 1.6, Bulgaria: 1.6,
  Slovenia: 1.6, Armenia: 1.6, Brazil: 1.6, "Trinidad and Tobago": 1.6,
  Germany: 1.5, Switzerland: 1.5, Austria: 1.5, Finland: 1.5, Croatia: 1.5,
  Serbia: 1.5, Macedonia: 1.5, Russia: 1.5, Chile: 1.5, Uruguay: 1.5,
  Cuba: 1.5, "Costa Rica": 1.5, "United Arab Emirates": 1.5, Canada: 1.4,
  Luxembourg: 1.4, Lithuania: 1.4, Greece: 1.4, Portugal: 1.4, Albania: 1.4,
  Belarus: 1.4, Bhutan: 1.4, Jamaica: 1.4, Bahamas: 1.4, Japan: 1.3,
  Italy: 1.3, Poland: 1.3, Cyprus: 1.3, "Bosnia and Herz.": 1.3,
  Thailand: 1.3, China: 1.2, Spain: 1.2, Ukraine: 1.2, Taiwan: 1.0,
  "Puerto Rico": 0.9, "South Korea": 0.8, Djibouti: 2.8, Greenland: 1.9,
};

// ===========================================================================
// Datasets for the non-choropleth forms (symbols, dots, categories, tiles,
// points, flows, bivariate). Same rule as above: keys are the EXACT atlas
// feature name.
// ===========================================================================

// Two-letter postal abbreviations, used by the tile-grid cartogram form.
const US_ABBR = {
  Alabama: "AL", Alaska: "AK", Arizona: "AZ", Arkansas: "AR", California: "CA",
  Colorado: "CO", Connecticut: "CT", Delaware: "DE",
  "District of Columbia": "DC", Florida: "FL", Georgia: "GA", Hawaii: "HI",
  Idaho: "ID", Illinois: "IL", Indiana: "IN", Iowa: "IA", Kansas: "KS",
  Kentucky: "KY", Louisiana: "LA", Maine: "ME", Maryland: "MD",
  Massachusetts: "MA", Michigan: "MI", Minnesota: "MN", Mississippi: "MS",
  Missouri: "MO", Montana: "MT", Nebraska: "NE", Nevada: "NV",
  "New Hampshire": "NH", "New Jersey": "NJ", "New Mexico": "NM",
  "New York": "NY", "North Carolina": "NC", "North Dakota": "ND", Ohio: "OH",
  Oklahoma: "OK", Oregon: "OR", Pennsylvania: "PA", "Rhode Island": "RI",
  "South Carolina": "SC", "South Dakota": "SD", Tennessee: "TN", Texas: "TX",
  Utah: "UT", Vermont: "VT", Virginia: "VA", Washington: "WA",
  "West Virginia": "WV", Wisconsin: "WI", Wyoming: "WY",
};

// Rough geographic tile layout: [row, column] on an 8 x 12 grid.
const US_TILE_GRID = {
  AK: [0, 0], ME: [0, 11],
  VT: [1, 9], NH: [1, 10], MA: [1, 11],
  WI: [2, 6], MI: [2, 7], NY: [2, 9], CT: [2, 10], RI: [2, 11],
  WA: [3, 1], ID: [3, 2], MT: [3, 3], ND: [3, 4], MN: [3, 5], IL: [3, 6],
  IN: [3, 7], OH: [3, 8], PA: [3, 9], NJ: [3, 10],
  OR: [4, 1], NV: [4, 2], WY: [4, 3], SD: [4, 4], IA: [4, 5], MO: [4, 6],
  KY: [4, 7], WV: [4, 8], VA: [4, 9], MD: [4, 10], DE: [4, 11],
  CA: [5, 1], UT: [5, 2], CO: [5, 3], NE: [5, 4], KS: [5, 5], AR: [5, 6],
  TN: [5, 7], NC: [5, 8], SC: [5, 9], DC: [5, 10],
  AZ: [6, 2], NM: [6, 3], OK: [6, 4], LA: [6, 5], MS: [6, 6], AL: [6, 7],
  GA: [6, 8],
  HI: [7, 0], TX: [7, 5], FL: [7, 9],
};

// Franchises in the four established North American leagues (NFL, NBA, MLB,
// NHL) counted by the state their home venue sits in for the 2024-25 seasons.
// Canadian clubs are excluded; the two New York NFL clubs and the Washington
// NFL club count where their stadiums actually are (New Jersey, Maryland).
// States with none are absent (no symbol drawn).
const US_PRO_TEAMS = {
  California: 15, Florida: 9, "New York": 8, Texas: 8, Pennsylvania: 7,
  Ohio: 6, Illinois: 5, Massachusetts: 4, Michigan: 4, Minnesota: 4,
  Colorado: 4, Missouri: 4, Georgia: 3, Maryland: 3, "North Carolina": 3,
  "New Jersey": 3, "District of Columbia": 3, Arizona: 3, Wisconsin: 3,
  Tennessee: 3, Washington: 3, Nevada: 2, Indiana: 2, Utah: 2, Louisiana: 2,
  Oklahoma: 1, Oregon: 1,
};

// Average number of tornadoes reported per year, approximate NOAA Storm
// Prediction Center 1991-2020 state averages (rounded).
const US_TORNADOES = {
  Texas: 155, Kansas: 96, Oklahoma: 68, Florida: 66, Nebraska: 57,
  Illinois: 54, Colorado: 53, Iowa: 51, Mississippi: 48, Alabama: 47,
  Missouri: 45, Minnesota: 45, Louisiana: 37, "South Dakota": 36,
  Arkansas: 33, "North Carolina": 31, Georgia: 30, "North Dakota": 30,
  Tennessee: 29, "South Carolina": 26, Wisconsin: 24, Indiana: 24,
  Kentucky: 21, Ohio: 19, Virginia: 18, Pennsylvania: 16, Michigan: 15,
  "New Mexico": 12, Montana: 12, Wyoming: 12, Maryland: 11, California: 11,
  "New York": 10, Arizona: 5, Utah: 5, Idaho: 4, "West Virginia": 4,
  Washington: 3, Oregon: 3, "New Jersey": 3, Maine: 3, Nevada: 2,
  Massachusetts: 2, "New Hampshire": 2, Connecticut: 1, Delaware: 1,
  Vermont: 1, Hawaii: 1, "Rhode Island": 0.3, Alaska: 0.1,
  "District of Columbia": 0.1,
};

// Number of farms, approximate 2022 USDA Census of Agriculture counts
// (rounded; the national total is about 1.9 million).
const US_FARMS = {
  Texas: 231000, Missouri: 87000, Iowa: 86000, Oklahoma: 78000, Ohio: 76000,
  Illinois: 71000, Kentucky: 69000, Minnesota: 66000, Tennessee: 65000,
  California: 63000, Wisconsin: 58000, Kansas: 55000, Indiana: 53000,
  Pennsylvania: 49000, Michigan: 45000, Nebraska: 44000, Florida: 44000,
  "North Carolina": 42000, Virginia: 41000, Arkansas: 39000, Alabama: 39000,
  Georgia: 39000, Colorado: 39000, Oregon: 35000, Mississippi: 34000,
  Washington: 32000, "New York": 30000, "South Dakota": 29000,
  "North Dakota": 26000, Louisiana: 26000, Montana: 24000, "New Mexico": 24000,
  Idaho: 22000, "South Carolina": 22000, "West Virginia": 22000,
  Arizona: 19000, Utah: 18000, Maryland: 12000, Wyoming: 11000,
  "New Jersey": 9500, Maine: 7600, Hawaii: 7300, Massachusetts: 7100,
  Vermont: 6500, Connecticut: 5500, "New Hampshire": 4100, Nevada: 3400,
  Delaware: 2300, "Rhode Island": 1200, Alaska: 1000,
  "District of Columbia": 20,
};

// Hogs and pigs on farms, approximate USDA NASS December 2023 inventory in
// head. The national total is roughly 75 million.
const US_HOGS = {
  Iowa: 24400000, Minnesota: 8900000, "North Carolina": 8000000,
  Illinois: 5400000, Indiana: 4400000, Nebraska: 3700000, Missouri: 3400000,
  Ohio: 2400000, Oklahoma: 2100000, Kansas: 2000000, "South Dakota": 1900000,
  Pennsylvania: 1300000, Michigan: 1200000, Texas: 1000000, Colorado: 700000,
  Utah: 700000, Kentucky: 400000, Wisconsin: 400000, Mississippi: 350000,
  Virginia: 250000, Montana: 200000, "South Carolina": 200000,
  "North Dakota": 140000, Arkansas: 130000, Tennessee: 130000, Arizona: 130000,
  California: 100000, Georgia: 100000, Wyoming: 100000, Alabama: 60000,
  "New York": 60000, Idaho: 40000, Washington: 30000, Oregon: 20000,
  Florida: 20000, Maryland: 20000, Hawaii: 12000, "New Jersey": 8000,
  "West Virginia": 6000, Massachusetts: 6000, Louisiana: 5000, Delaware: 5000,
  Maine: 4000, "New Mexico": 3000, Vermont: 3000, "New Hampshire": 3000,
  Connecticut: 3000, "Rhode Island": 2000, Nevada: 2000, Alaska: 1000,
};

// Crude oil production, approximate 2023 EIA state totals in millions of
// barrels for the year. Federal offshore production is not assigned to any
// state and is therefore not shown.
const US_OIL = {
  Texas: 1970, "New Mexico": 664, "North Dakota": 424, Colorado: 168,
  Alaska: 156, Oklahoma: 150, California: 116, Wyoming: 100, Utah: 55,
  Louisiana: 33, Kansas: 27, Montana: 24, Ohio: 21, "West Virginia": 12,
  Mississippi: 8, Illinois: 8, Alabama: 6, Pennsylvania: 5, Arkansas: 4,
  Michigan: 3, Nebraska: 2, Indiana: 2, Kentucky: 2, Florida: 1,
  "South Dakota": 0.5, Tennessee: 0.2, Nevada: 0.2, Missouri: 0.1,
  Arizona: 0.1,
};

// Legal status of cannabis for adult use, as of 2024 (state law only —
// cannabis remains federally controlled).
const US_CANNABIS = {
  Alaska: "rec", Arizona: "rec", California: "rec", Colorado: "rec",
  Connecticut: "rec", Delaware: "rec", Illinois: "rec", Maine: "rec",
  Maryland: "rec", Massachusetts: "rec", Michigan: "rec", Minnesota: "rec",
  Missouri: "rec", Montana: "rec", Nevada: "rec", "New Jersey": "rec",
  "New Mexico": "rec", "New York": "rec", Ohio: "rec", Oregon: "rec",
  "Rhode Island": "rec", Vermont: "rec", Virginia: "rec", Washington: "rec",
  "District of Columbia": "rec",
  Alabama: "med", Arkansas: "med", Florida: "med", Hawaii: "med",
  Kentucky: "med", Louisiana: "med", Mississippi: "med",
  "New Hampshire": "med", "North Dakota": "med", Oklahoma: "med",
  Pennsylvania: "med", "South Dakota": "med", Utah: "med",
  "West Virginia": "med",
  Georgia: "none", Idaho: "none", Indiana: "none", Iowa: "none",
  Kansas: "none", Nebraska: "none", "North Carolina": "none",
  "South Carolina": "none", Tennessee: "none", Texas: "none",
  Wisconsin: "none", Wyoming: "none",
};

// Largest single source of in-state utility-scale electricity net generation
// in 2023, from EIA state electricity profiles. A handful of states are
// near-ties (see the map description).
const US_POWER_SOURCE = {
  Alabama: "gas", Alaska: "gas", Arizona: "gas", Arkansas: "gas",
  California: "gas", Connecticut: "gas", Delaware: "gas", Florida: "gas",
  Georgia: "gas", Louisiana: "gas", Massachusetts: "gas", Michigan: "gas",
  Mississippi: "gas", Nevada: "gas", "New Jersey": "gas", "New Mexico": "gas",
  "New York": "gas", "North Carolina": "gas", Ohio: "gas", Oklahoma: "gas",
  Pennsylvania: "gas", "Rhode Island": "gas", Texas: "gas", Virginia: "gas",
  Wisconsin: "gas",
  Colorado: "coal", Indiana: "coal", Kentucky: "coal", Missouri: "coal",
  Montana: "coal", Nebraska: "coal", "North Dakota": "coal", Utah: "coal",
  "West Virginia": "coal", Wyoming: "coal",
  Illinois: "nuclear", Maryland: "nuclear", Minnesota: "nuclear",
  "New Hampshire": "nuclear", "South Carolina": "nuclear",
  Tennessee: "nuclear",
  Idaho: "hydro", Maine: "hydro", Oregon: "hydro", Vermont: "hydro",
  Washington: "hydro",
  Iowa: "wind", Kansas: "wind", "South Dakota": "wind",
  Hawaii: "petroleum",
};

// Jurisdictions where a state agency controls the wholesale and/or retail
// distribution of distilled spirits ("control" or ABC states); everywhere
// else spirits are sold under private licence.
const US_LIQUOR_CONTROL_STATES = [
  "Alabama", "Idaho", "Iowa", "Maine", "Michigan", "Mississippi", "Montana",
  "New Hampshire", "North Carolina", "Ohio", "Oregon", "Pennsylvania", "Utah",
  "Vermont", "Virginia", "West Virginia", "Wyoming",
];

// States whose statutes still authorise capital punishment (2024). Several
// of them, including California, Oregon and Pennsylvania, are under a
// governor's moratorium and are not carrying out executions.
const US_DEATH_PENALTY_STATES = [
  "Alabama", "Arizona", "Arkansas", "California", "Florida", "Georgia",
  "Idaho", "Indiana", "Kansas", "Kentucky", "Louisiana", "Mississippi",
  "Missouri", "Montana", "Nebraska", "Nevada", "North Carolina", "Ohio",
  "Oklahoma", "Oregon", "Pennsylvania", "South Carolina", "South Dakota",
  "Tennessee", "Texas", "Utah", "Wyoming",
];

// States with a statutory ban on union-security ("agency shop") agreements,
// as of 2024. Michigan's repeal took effect in February 2024.
const US_RIGHT_TO_WORK_STATES = [
  "Alabama", "Arizona", "Arkansas", "Florida", "Georgia", "Idaho", "Indiana",
  "Iowa", "Kansas", "Kentucky", "Louisiana", "Mississippi", "Nebraska",
  "Nevada", "North Carolina", "North Dakota", "Oklahoma", "South Carolina",
  "South Dakota", "Tennessee", "Texas", "Utah", "Virginia", "West Virginia",
  "Wisconsin", "Wyoming",
];

// State-level general sales tax rate in 2024 (percent). Where a state levies
// a mandatory statewide local add-on (Utah, Virginia, California) the
// combined statutory floor is shown. Five states levy none.
const US_SALES_TAX = {
  California: 7.25, Indiana: 7.0, Mississippi: 7.0, "Rhode Island": 7.0,
  Tennessee: 7.0, Minnesota: 6.875, Nevada: 6.85, "New Jersey": 6.625,
  Arkansas: 6.5, Kansas: 6.5, Washington: 6.5, Connecticut: 6.35,
  Illinois: 6.25, Massachusetts: 6.25, Texas: 6.25, Utah: 6.1, Florida: 6.0,
  Idaho: 6.0, Iowa: 6.0, Kentucky: 6.0, Maryland: 6.0, Michigan: 6.0,
  Pennsylvania: 6.0, "South Carolina": 6.0, Vermont: 6.0,
  "West Virginia": 6.0, "District of Columbia": 6.0, Ohio: 5.75,
  Arizona: 5.6, Maine: 5.5, Nebraska: 5.5, Virginia: 5.3,
  "North Dakota": 5.0, Wisconsin: 5.0, "New Mexico": 4.875,
  "North Carolina": 4.75, Oklahoma: 4.5, Louisiana: 4.45,
  Missouri: 4.225, "South Dakota": 4.2, Alabama: 4.0, Georgia: 4.0,
  Hawaii: 4.0, "New York": 4.0, Wyoming: 4.0, Colorado: 2.9, Alaska: 0,
  Delaware: 0, Montana: 0, "New Hampshire": 0, Oregon: 0,
};

// Share of adults with a body mass index of 30 or more (percent),
// approximate CDC Behavioral Risk Factor Surveillance System 2022 estimates.
const US_OBESITY = {
  "West Virginia": 41.0, Louisiana: 40.1, Oklahoma: 40.0, Alabama: 39.9,
  Mississippi: 39.5, Arkansas: 38.7, "South Dakota": 38.4, Delaware: 38.0,
  Kentucky: 37.7, Ohio: 37.5, Iowa: 37.4, Missouri: 37.3, Indiana: 36.8,
  Tennessee: 36.5, Texas: 36.1, Kansas: 36.0, Nebraska: 36.0,
  "North Carolina": 36.0, "South Carolina": 36.0, Wisconsin: 36.0,
  Michigan: 35.4, "North Dakota": 35.0, Georgia: 34.5, Illinois: 34.0,
  Pennsylvania: 33.4, Virginia: 33.4, Arizona: 33.0, Maine: 33.0,
  Minnesota: 33.0, Wyoming: 32.5, Alaska: 32.0, Maryland: 32.0,
  Nevada: 32.0, "New Hampshire": 32.0, "New Mexico": 32.0, Florida: 31.0,
  Idaho: 31.0, Oregon: 31.0, Connecticut: 30.0, "New York": 30.0,
  "Rhode Island": 30.0, Utah: 30.0, Washington: 30.0, "New Jersey": 29.0,
  California: 28.0, Montana: 28.0, Vermont: 28.0, Massachusetts: 27.2,
  Hawaii: 25.9, Colorado: 25.0, "District of Columbia": 24.3,
};

// Share of each state's total area owned by the federal government
// (percent), from the Congressional Research Service's compilation of the
// five major federal land-holding agencies. Figures are approximate.
const US_FEDERAL_LAND = {
  Nevada: 80.1, Utah: 63.1, Idaho: 61.9, Alaska: 60.9, Oregon: 52.9,
  Wyoming: 48.1, California: 45.4, Arizona: 38.6, Colorado: 35.9,
  "New Mexico": 34.7, Montana: 29.0, Washington: 28.5,
  "District of Columbia": 25.0, Hawaii: 20.0, "New Hampshire": 13.9,
  Florida: 13.0, Michigan: 10.0, Virginia: 9.9, Arkansas: 9.4, Vermont: 7.5,
  "West Virginia": 7.4, "North Carolina": 7.3, Minnesota: 6.8,
  "South Dakota": 5.4, Wisconsin: 5.3, Mississippi: 5.0, Tennessee: 4.9,
  Louisiana: 4.6, "South Carolina": 4.6, Georgia: 4.1, Kentucky: 4.1,
  "North Dakota": 3.9, Missouri: 3.8, "New Jersey": 3.6, Maryland: 3.1,
  Alabama: 2.7, Delaware: 2.4, Pennsylvania: 2.2, Texas: 1.8, Indiana: 1.7,
  Oklahoma: 1.6, Illinois: 1.5, Massachusetts: 1.2, Maine: 1.1,
  Nebraska: 1.1, Ohio: 1.0, "New York": 0.8, Kansas: 0.6,
  "Rhode Island": 0.4, Connecticut: 0.3, Iowa: 0.3,
};

// Per-capita consumption of ethanol from all alcoholic beverages, in gallons
// per person aged 14 and over, approximate NIAAA surveillance estimates.
// New Hampshire and Delaware are inflated by heavy cross-border buying.
const US_ALCOHOL = {
  "New Hampshire": 4.67, "District of Columbia": 3.65, Delaware: 3.52,
  Nevada: 3.42, Montana: 3.34, "North Dakota": 3.18, Vermont: 3.06,
  Wisconsin: 2.95, Idaho: 2.87, Colorado: 2.85, Maine: 2.83, Alaska: 2.77,
  Wyoming: 2.66, Oregon: 2.6, Minnesota: 2.6, "Rhode Island": 2.55,
  "South Dakota": 2.55, Florida: 2.51, Massachusetts: 2.46, Hawaii: 2.44,
  Louisiana: 2.42, Iowa: 2.35, Missouri: 2.34, Illinois: 2.3, Nebraska: 2.3,
  "South Carolina": 2.3, "New Mexico": 2.29, California: 2.29, Texas: 2.24,
  Michigan: 2.24, Arizona: 2.23, Connecticut: 2.22, Washington: 2.16,
  Pennsylvania: 2.13, Virginia: 2.1, "New Jersey": 2.05, Ohio: 2.02,
  Maryland: 2.02, Mississippi: 2.01, "New York": 1.98,
  "North Carolina": 1.98, Indiana: 1.95, Tennessee: 1.94, Alabama: 1.9,
  Kentucky: 1.86, Kansas: 1.85, Georgia: 1.82, Oklahoma: 1.71,
  Arkansas: 1.7, "West Virginia": 1.6, Utah: 1.34,
};

// The thirty busiest U.S. airports by total passengers handled in 2023
// (arrivals plus departures, in millions). Figures are rounded reported
// totals; coordinates are the airfield location.
const US_AIRPORTS = [
  { name: "ATL", lat: 33.641, lon: -84.428, value: 104.7 },
  { name: "DFW", lat: 32.900, lon: -97.040, value: 81.8 },
  { name: "DEN", lat: 39.856, lon: -104.674, value: 77.8 },
  { name: "LAX", lat: 33.942, lon: -118.408, value: 75.1 },
  { name: "ORD", lat: 41.974, lon: -87.907, value: 73.9 },
  { name: "JFK", lat: 40.641, lon: -73.778, value: 62.5 },
  { name: "MCO", lat: 28.431, lon: -81.308, value: 57.7 },
  { name: "LAS", lat: 36.084, lon: -115.154, value: 57.6 },
  { name: "CLT", lat: 35.214, lon: -80.947, value: 53.4 },
  { name: "MIA", lat: 25.796, lon: -80.287, value: 52.3 },
  { name: "SEA", lat: 47.450, lon: -122.309, value: 50.9 },
  { name: "SFO", lat: 37.621, lon: -122.379, value: 50.2 },
  { name: "EWR", lat: 40.690, lon: -74.175, value: 49.1 },
  { name: "PHX", lat: 33.434, lon: -112.012, value: 48.7 },
  { name: "IAH", lat: 29.990, lon: -95.337, value: 45.3 },
  { name: "BOS", lat: 42.366, lon: -71.010, value: 40.7 },
  { name: "FLL", lat: 26.074, lon: -80.151, value: 35.1 },
  { name: "MSP", lat: 44.885, lon: -93.222, value: 34.5 },
  { name: "DTW", lat: 42.216, lon: -83.355, value: 31.4 },
  { name: "LGA", lat: 40.777, lon: -73.874, value: 30.6 },
  { name: "PHL", lat: 39.874, lon: -75.242, value: 27.9 },
  { name: "SLC", lat: 40.790, lon: -111.979, value: 26.9 },
  { name: "BWI", lat: 39.177, lon: -76.668, value: 26.1 },
  { name: "IAD", lat: 38.953, lon: -77.457, value: 25.1 },
  { name: "DCA", lat: 38.851, lon: -77.040, value: 25.0 },
  { name: "TPA", lat: 27.976, lon: -82.533, value: 24.6 },
  { name: "SAN", lat: 32.734, lon: -117.193, value: 24.4 },
  { name: "BNA", lat: 36.126, lon: -86.677, value: 22.7 },
  { name: "AUS", lat: 30.198, lon: -97.666, value: 21.1 },
  { name: "MDW", lat: 41.787, lon: -87.752, value: 20.5 },
  { name: "HNL", lat: 21.319, lon: -157.922, value: 20.5 },
];

// Every commercial nuclear power station licensed and operating in the United
// States (site locations, one marker per site; several sites host two or
// three reactors). Retired stations such as Indian Point, Palisades and
// Three Mile Island are not shown.
const US_NUCLEAR_SITES = [
  { name: "Browns Ferry", lat: 34.704, lon: -87.119 },
  { name: "Farley", lat: 31.223, lon: -85.112 },
  { name: "Arkansas Nuclear One", lat: 35.310, lon: -93.231 },
  { name: "Palo Verde", lat: 33.389, lon: -112.865 },
  { name: "Diablo Canyon", lat: 35.211, lon: -120.855 },
  { name: "Millstone", lat: 41.310, lon: -72.168 },
  { name: "St. Lucie", lat: 27.349, lon: -80.246 },
  { name: "Turkey Point", lat: 25.435, lon: -80.331 },
  { name: "Hatch", lat: 31.934, lon: -82.345 },
  { name: "Vogtle", lat: 33.143, lon: -81.762 },
  { name: "Braidwood", lat: 41.244, lon: -88.229 },
  { name: "Byron", lat: 42.075, lon: -89.281 },
  { name: "Clinton", lat: 40.172, lon: -88.834 },
  { name: "Dresden", lat: 41.390, lon: -88.270 },
  { name: "LaSalle", lat: 41.246, lon: -88.669 },
  { name: "Quad Cities", lat: 41.726, lon: -90.310 },
  { name: "Waterford", lat: 29.996, lon: -90.472 },
  { name: "River Bend", lat: 30.757, lon: -91.334 },
  { name: "Wolf Creek", lat: 38.239, lon: -95.689 },
  { name: "Calvert Cliffs", lat: 38.434, lon: -76.442 },
  { name: "D.C. Cook", lat: 41.976, lon: -86.565 },
  { name: "Fermi", lat: 41.963, lon: -83.258 },
  { name: "Monticello", lat: 45.334, lon: -93.850 },
  { name: "Prairie Island", lat: 44.622, lon: -92.633 },
  { name: "Callaway", lat: 38.762, lon: -91.781 },
  { name: "Grand Gulf", lat: 32.008, lon: -91.048 },
  { name: "Cooper", lat: 40.362, lon: -95.641 },
  { name: "Seabrook", lat: 42.899, lon: -70.851 },
  { name: "Salem / Hope Creek", lat: 39.462, lon: -75.535 },
  { name: "Brunswick", lat: 33.958, lon: -78.010 },
  { name: "Harris", lat: 35.633, lon: -78.955 },
  { name: "McGuire", lat: 35.433, lon: -80.948 },
  { name: "Nine Mile Point / FitzPatrick", lat: 43.521, lon: -76.404 },
  { name: "Ginna", lat: 43.278, lon: -77.310 },
  { name: "Davis-Besse", lat: 41.597, lon: -83.086 },
  { name: "Perry", lat: 41.801, lon: -81.144 },
  { name: "Beaver Valley", lat: 40.622, lon: -80.434 },
  { name: "Limerick", lat: 40.226, lon: -75.586 },
  { name: "Peach Bottom", lat: 39.759, lon: -76.269 },
  { name: "Susquehanna", lat: 41.089, lon: -76.148 },
  { name: "Catawba", lat: 35.052, lon: -81.070 },
  { name: "Oconee", lat: 34.794, lon: -82.898 },
  { name: "Robinson", lat: 34.404, lon: -80.159 },
  { name: "Summer", lat: 34.298, lon: -81.320 },
  { name: "Sequoyah", lat: 35.226, lon: -85.091 },
  { name: "Watts Bar", lat: 35.603, lon: -84.790 },
  { name: "Comanche Peak", lat: 32.298, lon: -97.785 },
  { name: "South Texas Project", lat: 28.795, lon: -96.048 },
  { name: "North Anna", lat: 38.060, lon: -77.789 },
  { name: "Surry", lat: 37.166, lon: -76.698 },
  { name: "Columbia", lat: 46.471, lon: -119.333 },
  { name: "Point Beach", lat: 44.281, lon: -87.537 },
];

// All 63 units of the National Park System carrying the "National Park"
// designation. The two outside the projected map (American Samoa and the
// Virgin Islands) are dropped when the map is drawn.
const US_NATIONAL_PARKS = [
  { name: "Acadia", lat: 44.35, lon: -68.21 },
  { name: "Arches", lat: 38.68, lon: -109.57 },
  { name: "Badlands", lat: 43.86, lon: -102.34 },
  { name: "Big Bend", lat: 29.25, lon: -103.25 },
  { name: "Biscayne", lat: 25.49, lon: -80.21 },
  { name: "Black Canyon of the Gunnison", lat: 38.57, lon: -107.72 },
  { name: "Bryce Canyon", lat: 37.57, lon: -112.18 },
  { name: "Canyonlands", lat: 38.20, lon: -109.93 },
  { name: "Capitol Reef", lat: 38.20, lon: -111.17 },
  { name: "Carlsbad Caverns", lat: 32.17, lon: -104.44 },
  { name: "Channel Islands", lat: 34.01, lon: -119.42 },
  { name: "Congaree", lat: 33.78, lon: -80.78 },
  { name: "Crater Lake", lat: 42.94, lon: -122.10 },
  { name: "Cuyahoga Valley", lat: 41.24, lon: -81.55 },
  { name: "Death Valley", lat: 36.51, lon: -117.08 },
  { name: "Denali", lat: 63.33, lon: -150.50 },
  { name: "Dry Tortugas", lat: 24.63, lon: -82.87 },
  { name: "Everglades", lat: 25.32, lon: -80.93 },
  { name: "Gates of the Arctic", lat: 67.78, lon: -153.30 },
  { name: "Gateway Arch", lat: 38.63, lon: -90.19 },
  { name: "Glacier", lat: 48.80, lon: -114.00 },
  { name: "Glacier Bay", lat: 58.50, lon: -137.00 },
  { name: "Grand Canyon", lat: 36.06, lon: -112.14 },
  { name: "Grand Teton", lat: 43.73, lon: -110.80 },
  { name: "Great Basin", lat: 38.98, lon: -114.30 },
  { name: "Great Sand Dunes", lat: 37.73, lon: -105.51 },
  { name: "Great Smoky Mountains", lat: 35.68, lon: -83.53 },
  { name: "Guadalupe Mountains", lat: 31.92, lon: -104.87 },
  { name: "Haleakala", lat: 20.72, lon: -156.17 },
  { name: "Hawaii Volcanoes", lat: 19.38, lon: -155.20 },
  { name: "Hot Springs", lat: 34.51, lon: -93.05 },
  { name: "Indiana Dunes", lat: 41.65, lon: -87.06 },
  { name: "Isle Royale", lat: 48.10, lon: -88.55 },
  { name: "Joshua Tree", lat: 33.79, lon: -115.90 },
  { name: "Katmai", lat: 58.50, lon: -155.00 },
  { name: "Kenai Fjords", lat: 59.92, lon: -149.65 },
  { name: "Kings Canyon", lat: 36.80, lon: -118.55 },
  { name: "Kobuk Valley", lat: 67.55, lon: -159.28 },
  { name: "Lake Clark", lat: 60.97, lon: -153.42 },
  { name: "Lassen Volcanic", lat: 40.49, lon: -121.51 },
  { name: "Mammoth Cave", lat: 37.18, lon: -86.10 },
  { name: "Mesa Verde", lat: 37.23, lon: -108.46 },
  { name: "Mount Rainier", lat: 46.85, lon: -121.75 },
  { name: "New River Gorge", lat: 37.88, lon: -81.06 },
  { name: "North Cascades", lat: 48.70, lon: -121.20 },
  { name: "Olympic", lat: 47.80, lon: -123.60 },
  { name: "Petrified Forest", lat: 35.07, lon: -109.78 },
  { name: "Pinnacles", lat: 36.48, lon: -121.16 },
  { name: "Redwood", lat: 41.30, lon: -124.00 },
  { name: "Rocky Mountain", lat: 40.40, lon: -105.58 },
  { name: "Saguaro", lat: 32.25, lon: -110.50 },
  { name: "Sequoia", lat: 36.43, lon: -118.68 },
  { name: "Shenandoah", lat: 38.53, lon: -78.35 },
  { name: "Theodore Roosevelt", lat: 46.98, lon: -103.54 },
  { name: "Virgin Islands", lat: 18.34, lon: -64.73 },
  { name: "Voyageurs", lat: 48.50, lon: -92.88 },
  { name: "White Sands", lat: 32.78, lon: -106.17 },
  { name: "Wind Cave", lat: 43.57, lon: -103.48 },
  { name: "Wrangell-St. Elias", lat: 61.00, lon: -142.00 },
  { name: "Yellowstone", lat: 44.60, lon: -110.50 },
  { name: "Yosemite", lat: 37.83, lon: -119.50 },
  { name: "Zion", lat: 37.30, lon: -113.05 },
  { name: "American Samoa", lat: -14.25, lon: -170.68 },
];

// Heaviest domestic origin-and-destination airline markets. Arc width is
// scaled to approximate annual round-trip passengers in millions; the
// volumes are rounded estimates and the ranking is what the map is about.
const US_AIR_ROUTES = [
  { from: [33.942, -118.408], to: [40.641, -73.778], value: 3.0 },
  { from: [33.641, -84.428], to: [28.431, -81.308], value: 2.9 },
  { from: [33.942, -118.408], to: [37.621, -122.379], value: 2.6 },
  { from: [33.942, -118.408], to: [36.084, -115.154], value: 2.4 },
  { from: [33.942, -118.408], to: [41.974, -87.907], value: 2.1 },
  { from: [33.942, -118.408], to: [47.450, -122.309], value: 2.0 },
  { from: [40.641, -73.778], to: [37.621, -122.379], value: 1.8 },
  { from: [41.974, -87.907], to: [40.777, -73.874], value: 1.7 },
  { from: [32.900, -97.040], to: [33.942, -118.408], value: 1.7 },
  { from: [33.942, -118.408], to: [39.856, -104.674], value: 1.7 },
  { from: [33.641, -84.428], to: [26.074, -80.151], value: 1.6 },
  { from: [39.856, -104.674], to: [41.974, -87.907], value: 1.6 },
  { from: [33.641, -84.428], to: [40.777, -73.874], value: 1.5 },
  { from: [36.084, -115.154], to: [37.621, -122.379], value: 1.4 },
  { from: [33.641, -84.428], to: [27.976, -82.533], value: 1.4 },
  { from: [33.942, -118.408], to: [33.434, -112.012], value: 1.4 },
  { from: [40.641, -73.778], to: [28.431, -81.308], value: 1.3 },
  { from: [28.431, -81.308], to: [40.690, -74.175], value: 1.3 },
  { from: [47.450, -122.309], to: [37.621, -122.379], value: 1.3 },
  { from: [39.856, -104.674], to: [33.434, -112.012], value: 1.3 },
  { from: [41.974, -87.907], to: [37.621, -122.379], value: 1.3 },
  { from: [39.874, -75.242], to: [28.431, -81.308], value: 1.0 },
  { from: [32.900, -97.040], to: [41.974, -87.907], value: 1.2 },
  { from: [42.366, -71.010], to: [38.851, -77.040], value: 1.2 },
  { from: [33.641, -84.428], to: [25.796, -80.287], value: 1.2 },
  { from: [40.777, -73.874], to: [25.796, -80.287], value: 1.1 },
];

// ---------------------------------------------------------------------------
// World datasets for the new forms
// ---------------------------------------------------------------------------

// Countries with ten or more inscribed UNESCO World Heritage sites, counted
// after the 2024 session of the World Heritage Committee.
const WORLD_HERITAGE = {
  Italy: 60, China: 59, Germany: 54, France: 53, Spain: 50, India: 43,
  Mexico: 35, "United Kingdom": 35, Russia: 32, Iran: 28, Japan: 26,
  "United States of America": 26, Brazil: 24, Canada: 22, Turkey: 21,
  Australia: 20, Greece: 19, Portugal: 17, Poland: 17, Czechia: 17,
  Belgium: 16, "South Korea": 16, Sweden: 15, Switzerland: 13,
  Netherlands: 13, Peru: 13, Austria: 12, Argentina: 12, Bulgaria: 10,
  Croatia: 10, Denmark: 10, Indonesia: 10, "South Africa": 10,
};

// Territorial carbon dioxide emissions from fossil fuels and industry,
// approximate annual figures in millions of tonnes around 2022-2023. Values
// below about 5 Mt are omitted (their symbols would be invisible anyway).
const WORLD_CO2 = {
  China: 11500, "United States of America": 4900, India: 2800, Russia: 1650,
  Japan: 1050, Iran: 750, Indonesia: 700, "Saudi Arabia": 620, Germany: 650,
  "South Korea": 600, Canada: 550, Brazil: 480, Mexico: 470, Turkey: 420,
  "South Africa": 400, Australia: 390, Vietnam: 340, "United Kingdom": 320,
  Italy: 320, France: 300, Poland: 300, Thailand: 280, Kazakhstan: 280,
  Taiwan: 280, Egypt: 250, Malaysia: 250, Spain: 230, Pakistan: 230,
  "United Arab Emirates": 230, Iraq: 200, Argentina: 190, Algeria: 160,
  Philippines: 150, Ukraine: 130, Netherlands: 130, Nigeria: 130, Qatar: 130,
  Uzbekistan: 120, Kuwait: 110, Colombia: 100, Venezuela: 100,
  Bangladesh: 100, Chile: 90, Czechia: 90, Belgium: 90, Turkmenistan: 90,
  Romania: 70, Morocco: 70, Oman: 70, Peru: 60, Greece: 60, Austria: 60,
  Israel: 60, Belarus: 60, Libya: 55, "North Korea": 50,
  Hungary: 45, Serbia: 45, Sweden: 40, Norway: 40, Portugal: 40,
  Finland: 40, Bulgaria: 40, Azerbaijan: 40, Ecuador: 40,
  "Trinidad and Tobago": 40, Switzerland: 35, Ireland: 35, "New Zealand": 35,
  Denmark: 30, Myanmar: 30, Mongolia: 30, Slovakia: 30, Tunisia: 30,
  "Dominican Rep.": 30, Angola: 25, Bolivia: 25, Jordan: 25, Syria: 25,
  "Sri Lanka": 25, Laos: 25, "Bosnia and Herz.": 22, Cuba: 20, Ghana: 20,
  Kenya: 20, Ethiopia: 20, Sudan: 20, Guatemala: 20, Cambodia: 20,
  Croatia: 18, Nepal: 15, Tanzania: 15, "Côte d'Ivoire": 15, Georgia: 12,
  Panama: 12, Lithuania: 12, Kyrgyzstan: 12, Brunei: 12, Senegal: 12,
  Yemen: 10, Zimbabwe: 10, Mozambique: 10, Honduras: 10, Cameroon: 10,
  Afghanistan: 10, Estonia: 10, "Costa Rica": 9, Zambia: 8, Paraguay: 8,
  Macedonia: 8, Cyprus: 8, Luxembourg: 8, Tajikistan: 8, Benin: 8,
  Jamaica: 8, Uruguay: 7, Armenia: 7, Latvia: 7, "El Salvador": 7,
  Botswana: 6, Moldova: 6, Uganda: 6, Gabon: 6, Albania: 5, Nicaragua: 5,
  "Dem. Rep. Congo": 5, Mali: 5, "Burkina Faso": 5,
};

// Countries and territories where road traffic keeps to the left.
const WORLD_LEFT_HAND_TRAFFIC = [
  "United Kingdom", "Ireland", "Cyprus", "India", "Pakistan", "Bangladesh",
  "Nepal", "Sri Lanka", "Bhutan", "Thailand", "Malaysia", "Indonesia",
  "Timor-Leste", "Japan", "Australia", "New Zealand", "Papua New Guinea",
  "Fiji", "Solomon Is.", "Kenya", "Tanzania", "Uganda", "Zambia", "Zimbabwe",
  "Malawi", "Mozambique", "South Africa", "Namibia", "Botswana", "Lesotho",
  "eSwatini", "Jamaica", "Bahamas", "Trinidad and Tobago", "Guyana",
  "Suriname", "Brunei", "Falkland Is.",
];

// Countries whose domestic mains supply is nominally in the 100-127 volt
// band rather than the 220-240 volt band used by most of the world. Brazil
// is deliberately left out: it uses both, region by region.
const WORLD_LOW_VOLTAGE = [
  "United States of America", "Canada", "Mexico", "Guatemala", "Belize",
  "Honduras", "El Salvador", "Nicaragua", "Costa Rica", "Panama", "Colombia",
  "Venezuela", "Ecuador", "Cuba", "Dominican Rep.", "Haiti", "Jamaica",
  "Bahamas", "Trinidad and Tobago", "Puerto Rico", "Japan", "Taiwan",
  "Liberia", "Suriname",
];

// Sovereign states with a hereditary monarch as head of state, including the
// Commonwealth realms that share one. Micro-states below the resolution of
// the 110m boundary file are not represented.
const WORLD_MONARCHIES = [
  "United Kingdom", "Spain", "Sweden", "Norway", "Denmark", "Netherlands",
  "Belgium", "Luxembourg", "Japan", "Thailand", "Cambodia", "Malaysia",
  "Brunei", "Bhutan", "Saudi Arabia", "Jordan", "Kuwait", "Qatar", "Oman",
  "United Arab Emirates", "Morocco", "Lesotho", "eSwatini", "Canada",
  "Australia", "New Zealand", "Papua New Guinea", "Solomon Is.", "Jamaica",
  "Bahamas", "Belize", "Greenland", "Falkland Is.",
];

// The urban agglomerations the UN's World Urbanization Prospects counted
// above ten million residents.
const WORLD_MEGACITIES = [
  { name: "Tokyo", lat: 35.68, lon: 139.69 },
  { name: "Delhi", lat: 28.61, lon: 77.21 },
  { name: "Shanghai", lat: 31.23, lon: 121.47 },
  { name: "Sao Paulo", lat: -23.55, lon: -46.63 },
  { name: "Mexico City", lat: 19.43, lon: -99.13 },
  { name: "Cairo", lat: 30.04, lon: 31.24 },
  { name: "Mumbai", lat: 19.08, lon: 72.88 },
  { name: "Beijing", lat: 39.90, lon: 116.41 },
  { name: "Dhaka", lat: 23.81, lon: 90.41 },
  { name: "Osaka", lat: 34.69, lon: 135.50 },
  { name: "New York", lat: 40.71, lon: -74.01 },
  { name: "Karachi", lat: 24.86, lon: 67.01 },
  { name: "Buenos Aires", lat: -34.60, lon: -58.38 },
  { name: "Chongqing", lat: 29.56, lon: 106.55 },
  { name: "Istanbul", lat: 41.01, lon: 28.98 },
  { name: "Kolkata", lat: 22.57, lon: 88.36 },
  { name: "Manila", lat: 14.60, lon: 120.98 },
  { name: "Lagos", lat: 6.52, lon: 3.38 },
  { name: "Rio de Janeiro", lat: -22.91, lon: -43.17 },
  { name: "Tianjin", lat: 39.34, lon: 117.36 },
  { name: "Kinshasa", lat: -4.44, lon: 15.27 },
  { name: "Guangzhou", lat: 23.13, lon: 113.26 },
  { name: "Los Angeles", lat: 34.05, lon: -118.24 },
  { name: "Moscow", lat: 55.76, lon: 37.62 },
  { name: "Shenzhen", lat: 22.54, lon: 114.06 },
  { name: "Lahore", lat: 31.55, lon: 74.34 },
  { name: "Bangalore", lat: 12.97, lon: 77.59 },
  { name: "Paris", lat: 48.86, lon: 2.35 },
  { name: "Bogota", lat: 4.71, lon: -74.07 },
  { name: "Jakarta", lat: -6.21, lon: 106.85 },
  { name: "Chennai", lat: 13.08, lon: 80.27 },
  { name: "Lima", lat: -12.05, lon: -77.04 },
  { name: "Bangkok", lat: 13.76, lon: 100.50 },
];

// ---------------------------------------------------------------------------
// Derived two-class datasets. Built by expanding a membership list over every
// feature in the atlas, so a categorical map can never silently leave a
// state or country unshaded because a key was missed.
// ---------------------------------------------------------------------------

const US_FEATURE_NAMES = usStates.map((f) => f.properties.name);
const WORLD_FEATURE_NAMES = worldCountries
  .map((f) => f.properties.name)
  .filter((n) => n !== "Antarctica");

function expandMembership(featureNames, members, inKey, outKey) {
  const set = new Set(members);
  const missing = members.filter((m) => !featureNames.includes(m));
  if (missing.length) {
    throw new Error(`membership list has unknown features: ${missing.join(", ")}`);
  }
  return Object.fromEntries(
    featureNames.map((n) => [n, set.has(n) ? inKey : outKey]),
  );
}

const US_LIQUOR_CONTROL = expandMembership(
  US_FEATURE_NAMES, US_LIQUOR_CONTROL_STATES, "control", "licence",
);
const US_DEATH_PENALTY = expandMembership(
  US_FEATURE_NAMES, US_DEATH_PENALTY_STATES, "yes", "no",
);
const US_RIGHT_TO_WORK = expandMembership(
  US_FEATURE_NAMES, US_RIGHT_TO_WORK_STATES, "yes", "no",
);
const WORLD_DRIVING_SIDE = expandMembership(
  WORLD_FEATURE_NAMES, WORLD_LEFT_HAND_TRAFFIC, "left", "right",
);
const WORLD_MONARCHY = expandMembership(
  WORLD_FEATURE_NAMES, WORLD_MONARCHIES, "monarchy", "republic",
);
const WORLD_VOLTAGE = expandMembership(
  WORLD_FEATURE_NAMES, WORLD_LOW_VOLTAGE, "low", "high",
);
// Brazil runs both bands, so it is deliberately excluded from the map.
delete WORLD_VOLTAGE.Brazil;


// ---------------------------------------------------------------------------
// Datasets for the second wave of forms (diverging, classed, cartogram,
// Dorling, spike, composition and interpolated surface). Figures that are
// estimates rather than published exact values say so in the description of
// the map that uses them.
// ---------------------------------------------------------------------------

/** Percent change in resident population, 2010 -> 2020 Census. */
const US_POP_CHANGE = {
  Alabama: 5.1, Alaska: 3.3, Arizona: 11.9, Arkansas: 3.3, California: 6.1,
  Colorado: 14.8, Connecticut: 0.9, Delaware: 10.2,
  "District of Columbia": 14.6, Florida: 14.6, Georgia: 10.6, Hawaii: 7.0,
  Idaho: 17.3, Illinois: -0.1, Indiana: 4.7, Iowa: 4.7, Kansas: 3.0,
  Kentucky: 3.8, Louisiana: 2.7, Maine: 2.6, Maryland: 7.0,
  Massachusetts: 7.4, Michigan: 2.0, Minnesota: 7.6, Mississippi: -0.2,
  Missouri: 2.8, Montana: 9.6, Nebraska: 7.4, Nevada: 15.0,
  "New Hampshire": 4.6, "New Jersey": 5.7, "New Mexico": 2.8, "New York": 4.2,
  "North Carolina": 9.5, "North Dakota": 15.8, Ohio: 2.3, Oklahoma: 5.5,
  Oregon: 10.6, Pennsylvania: 2.4, "Rhode Island": 4.3,
  "South Carolina": 10.7, "South Dakota": 8.9, Tennessee: 8.9, Texas: 15.9,
  Utah: 18.4, Vermont: 2.8, Virginia: 7.9, Washington: 14.6,
  "West Virginia": -3.2, Wisconsin: 3.6, Wyoming: 2.3,
};

/** Net domestic migration per 1,000 residents, ~2022-23. Rounded estimates. */
const US_NET_MIGRATION = {
  Alabama: 5, Alaska: -5, Arizona: 4, Arkansas: 4, California: -8, Colorado: 0,
  Connecticut: 1, Delaware: 8, "District of Columbia": -6, Florida: 7,
  Georgia: 3, Hawaii: -7, Idaho: 9, Illinois: -7, Indiana: 2, Iowa: 0,
  Kansas: -1, Kentucky: 2, Louisiana: -7, Maine: 5, Maryland: -3,
  Massachusetts: -5, Michigan: 0, Minnesota: -2, Mississippi: -1, Missouri: 1,
  Montana: 6, Nebraska: -1, Nevada: 3, "New Hampshire": 5, "New Jersey": -5,
  "New Mexico": 0, "New York": -11, "North Carolina": 8, "North Dakota": -2,
  Ohio: 0, Oklahoma: 3, Oregon: -3, Pennsylvania: 0, "Rhode Island": 0,
  "South Carolina": 12, "South Dakota": 4, Tennessee: 7, Texas: 5, Utah: 1,
  Vermont: 3, Virginia: -1, Washington: -1, "West Virginia": 2, Wisconsin: 0,
  Wyoming: 2,
};

/** Annual population growth rate, percent, ~2022. */
const WORLD_POP_GROWTH = {
  Niger: 3.7, Angola: 3.1, "Dem. Rep. Congo": 3.2, Chad: 3.1, Mali: 3.0,
  Somalia: 3.1, Uganda: 2.9, Tanzania: 2.9, Burundi: 2.7, Mozambique: 2.9,
  Zambia: 2.8, Sudan: 2.6, "S. Sudan": 2.5, Nigeria: 2.4, Ethiopia: 2.5,
  Senegal: 2.5, Guinea: 2.3, "Burkina Faso": 2.5, Madagascar: 2.4, Kenya: 2.0,
  Ghana: 1.9, Afghanistan: 2.7, Yemen: 2.1, Iraq: 2.3, Egypt: 1.6,
  Pakistan: 2.0, Philippines: 1.5, Israel: 1.6, "Saudi Arabia": 1.5,
  Bolivia: 1.3, Guatemala: 1.4, Honduras: 1.5, Paraguay: 1.2, Peru: 1.1,
  Mexico: 0.8, India: 0.8, Indonesia: 0.7, Bangladesh: 1.0, Malaysia: 1.1,
  Turkey: 0.6, Argentina: 0.6, Colombia: 0.5, Brazil: 0.4, Vietnam: 0.7,
  "United States of America": 0.4, Australia: 1.0, Canada: 1.8,
  "United Kingdom": 0.4, France: 0.3, Netherlands: 0.6, Sweden: 0.4,
  Norway: 0.6, Denmark: 0.5, Belgium: 0.4, Switzerland: 0.7, Austria: 0.5,
  Ireland: 1.1, Spain: 0.3, Chile: 0.4, "New Zealand": 0.6, Thailand: 0.1,
  China: -0.1, Germany: 0.1, Portugal: -0.1, Poland: -0.3, Romania: -0.4,
  Greece: -0.4, Italy: -0.3, Croatia: -0.5, Hungary: -0.2, Bulgaria: -1.0,
  Serbia: -0.6, Japan: -0.5, "South Korea": -0.2, Cuba: -0.5, Latvia: -1.0,
  Lithuania: -0.4, Estonia: 0.2, Finland: 0.1, Czechia: 0.3, Slovakia: 0.0,
};

/** Percent of people under 65 without health insurance, ~2022. */
const US_UNINSURED = {
  Alabama: 10.0, Alaska: 11.4, Arizona: 11.6, Arkansas: 9.9, California: 7.4,
  Colorado: 7.9, Connecticut: 6.0, Delaware: 6.6, "District of Columbia": 3.6,
  Florida: 13.9, Georgia: 13.6, Hawaii: 4.5, Idaho: 9.7, Illinois: 7.7,
  Indiana: 8.1, Iowa: 5.4, Kansas: 9.6, Kentucky: 6.8, Louisiana: 8.9,
  Maine: 6.6, Maryland: 6.7, Massachusetts: 2.9, Michigan: 5.6,
  Minnesota: 5.2, Mississippi: 12.9, Missouri: 9.6, Montana: 9.0,
  Nebraska: 7.5, Nevada: 12.0, "New Hampshire": 6.1, "New Jersey": 8.0,
  "New Mexico": 9.5, "New York": 5.9, "North Carolina": 11.3,
  "North Dakota": 7.8, Ohio: 7.0, Oklahoma: 14.3, Oregon: 6.9,
  Pennsylvania: 6.3, "Rhode Island": 4.6, "South Carolina": 11.0,
  "South Dakota": 10.4, Tennessee: 10.7, Texas: 18.0, Utah: 9.6, Vermont: 4.3,
  Virginia: 7.9, Washington: 6.5, "West Virginia": 7.2, Wisconsin: 5.9,
  Wyoming: 12.3,
};

/** Homeownership rate, percent of occupied housing units, ~2023. */
const US_HOMEOWNERSHIP = {
  Alabama: 72.5, Alaska: 66.0, Arizona: 68.8, Arkansas: 67.0,
  California: 55.9, Colorado: 66.5, Connecticut: 66.3, Delaware: 74.8,
  "District of Columbia": 42.0, Florida: 68.0, Georgia: 66.4, Hawaii: 61.0,
  Idaho: 72.3, Illinois: 66.6, Indiana: 71.5, Iowa: 71.9, Kansas: 68.1,
  Kentucky: 70.0, Louisiana: 66.9, Maine: 76.5, Maryland: 68.0,
  Massachusetts: 62.5, Michigan: 74.0, Minnesota: 74.6, Mississippi: 70.4,
  Missouri: 69.4, Montana: 70.5, Nebraska: 66.7, Nevada: 60.5,
  "New Hampshire": 73.2, "New Jersey": 65.5, "New Mexico": 69.4,
  "New York": 54.1, "North Carolina": 67.4, "North Dakota": 63.5, Ohio: 68.2,
  Oklahoma: 67.6, Oregon: 64.2, Pennsylvania: 71.3, "Rhode Island": 63.0,
  "South Carolina": 72.6, "South Dakota": 68.9, Tennessee: 68.4, Texas: 63.2,
  Utah: 71.5, Vermont: 73.0, Virginia: 68.3, Washington: 65.0,
  "West Virginia": 78.9, Wisconsin: 68.6, Wyoming: 73.1,
};

/** Median age in years, ~2023. */
const WORLD_MEDIAN_AGE = {
  Niger: 15, Mali: 16, Chad: 16, Uganda: 16, Angola: 16, "Dem. Rep. Congo": 17,
  Somalia: 17, Mozambique: 17, Burundi: 17, Zambia: 17, Tanzania: 18,
  Nigeria: 18, "Burkina Faso": 18, Afghanistan: 18, Senegal: 19, Ethiopia: 19,
  Sudan: 19, Madagascar: 20, Kenya: 20, Ghana: 21, Yemen: 20, Iraq: 21,
  Pakistan: 21, Guatemala: 23, Honduras: 24, Egypt: 24, Philippines: 25,
  Bolivia: 25, Israel: 30, "Saudi Arabia": 32, India: 28, Bangladesh: 28,
  "South Africa": 28, Mexico: 30, Peru: 31, Malaysia: 31, Indonesia: 30,
  Colombia: 32, Turkey: 33, Vietnam: 33, Argentina: 33, Brazil: 34,
  "United States of America": 39, Australia: 38, "New Zealand": 38,
  Ireland: 39, Chile: 36, China: 39, Thailand: 40, Norway: 40, Iceland: 37,
  "United Kingdom": 40, France: 42, Sweden: 41, Denmark: 42, Netherlands: 42,
  Belgium: 42, Switzerland: 43, Canada: 41, Poland: 42, Russia: 40,
  Austria: 44, Czechia: 43, Hungary: 43, Croatia: 44, Finland: 43,
  Slovenia: 45, Bulgaria: 45, Greece: 46, Germany: 46, Portugal: 46,
  Spain: 45, Italy: 48, Japan: 49, "South Korea": 45,
};

/** State gross domestic product, billions of dollars, ~2023. Rounded. */
const US_GDP = {
  Alabama: 300, Alaska: 68, Arizona: 505, Arkansas: 175, California: 3900,
  Colorado: 515, Connecticut: 350, Delaware: 92, "District of Columbia": 165,
  Florida: 1580, Georgia: 830, Hawaii: 105, Idaho: 120, Illinois: 1090,
  Indiana: 490, Iowa: 250, Kansas: 225, Kentucky: 275, Louisiana: 305,
  Maine: 85, Maryland: 500, Massachusetts: 730, Michigan: 640,
  Minnesota: 470, Mississippi: 145, Missouri: 435, Montana: 68,
  Nebraska: 175, Nevada: 235, "New Hampshire": 110, "New Jersey": 800,
  "New Mexico": 135, "New York": 2160, "North Carolina": 800,
  "North Dakota": 75, Ohio: 890, Oklahoma: 255, Oregon: 300,
  Pennsylvania: 1000, "Rhode Island": 74, "South Carolina": 335,
  "South Dakota": 70, Tennessee: 530, Texas: 2560, Utah: 260, Vermont: 41,
  Virginia: 700, Washington: 790, "West Virginia": 100, Wisconsin: 440,
  Wyoming: 50,
};

/** Veteran population, thousands, ~2022. Rounded estimates. */
const US_VETERANS = {
  Alabama: 350, Alaska: 65, Arizona: 460, Arkansas: 200, California: 1450,
  Colorado: 380, Connecticut: 155, Delaware: 65, "District of Columbia": 25,
  Florida: 1440, Georgia: 640, Hawaii: 100, Idaho: 120, Illinois: 570,
  Indiana: 380, Iowa: 190, Kansas: 190, Kentucky: 280, Louisiana: 260,
  Maine: 110, Maryland: 370, Massachusetts: 300, Michigan: 530,
  Minnesota: 300, Mississippi: 180, Missouri: 400, Montana: 90,
  Nebraska: 120, Nevada: 210, "New Hampshire": 95, "New Jersey": 320,
  "New Mexico": 145, "New York": 700, "North Carolina": 660,
  "North Dakota": 50, Ohio: 690, Oklahoma: 280, Oregon: 280,
  Pennsylvania: 720, "Rhode Island": 60, "South Carolina": 380,
  "South Dakota": 63, Tennessee: 450, Texas: 1450, Utah: 130, Vermont: 40,
  Virginia: 690, Washington: 520, "West Virginia": 130, Wisconsin: 340,
  Wyoming: 45,
};

/** Public K-12 school enrollment, thousands, ~2022. Rounded. */
const US_K12 = {
  Alabama: 730, Alaska: 130, Arizona: 1120, Arkansas: 480, California: 5850,
  Colorado: 880, Connecticut: 510, Delaware: 140, "District of Columbia": 90,
  Florida: 2840, Georgia: 1740, Hawaii: 175, Idaho: 315, Illinois: 1830,
  Indiana: 1010, Iowa: 510, Kansas: 480, Kentucky: 640, Louisiana: 690,
  Maine: 175, Maryland: 880, Massachusetts: 910, Michigan: 1400,
  Minnesota: 875, Mississippi: 440, Missouri: 870, Montana: 150,
  Nebraska: 325, Nevada: 490, "New Hampshire": 165, "New Jersey": 1370,
  "New Mexico": 315, "New York": 2570, "North Carolina": 1520,
  "North Dakota": 120, Ohio: 1660, Oklahoma: 700, Oregon: 550,
  Pennsylvania: 1720, "Rhode Island": 140, "South Carolina": 780,
  "South Dakota": 145, Tennessee: 1000, Texas: 5450, Utah: 680, Vermont: 82,
  Virginia: 1250, Washington: 1090, "West Virginia": 250, Wisconsin: 820,
  Wyoming: 94,
};

/** Degree-granting higher-education enrollment, thousands, ~2022. Rounded. */
const US_COLLEGE = {
  Alabama: 300, Alaska: 26, Arizona: 570, Arkansas: 155, California: 2450,
  Colorado: 320, Connecticut: 190, Delaware: 58, "District of Columbia": 90,
  Florida: 1080, Georgia: 590, Hawaii: 55, Idaho: 105, Illinois: 700,
  Indiana: 400, Iowa: 220, Kansas: 190, Kentucky: 250, Louisiana: 235,
  Maine: 62, Maryland: 320, Massachusetts: 480, Michigan: 520,
  Minnesota: 340, Mississippi: 160, Missouri: 370, Montana: 50,
  Nebraska: 130, Nevada: 125, "New Hampshire": 130, "New Jersey": 400,
  "New Mexico": 115, "New York": 1150, "North Carolina": 570,
  "North Dakota": 50, Ohio: 640, Oklahoma: 200, Oregon: 210,
  Pennsylvania: 690, "Rhode Island": 80, "South Carolina": 260,
  "South Dakota": 55, Tennessee: 340, Texas: 1620, Utah: 290, Vermont: 40,
  Virginia: 550, Washington: 360, "West Virginia": 105, Wisconsin: 320,
  Wyoming: 30,
};

/** Internet users, millions, ~2023. Rounded estimates. */
const WORLD_INTERNET_USERS = {
  China: 1080, India: 880, "United States of America": 315, Indonesia: 215,
  Brazil: 180, Russia: 130, Nigeria: 105, Japan: 105, Mexico: 100,
  Bangladesh: 77, Pakistan: 87, Germany: 78, Philippines: 86, Vietnam: 78,
  Turkey: 71, "United Kingdom": 66, France: 60, Egypt: 55, Iran: 78,
  Thailand: 61, Italy: 51, "South Korea": 50, Spain: 44, Ethiopia: 30,
  Canada: 36, Poland: 32, Argentina: 39, Colombia: 39, "South Africa": 43,
  Ukraine: 30, Malaysia: 32, Australia: 25, "Saudi Arabia": 35, Morocco: 32,
  Peru: 27, Algeria: 32, Kenya: 25, Netherlands: 16, Iraq: 32, Sudan: 14,
  Tanzania: 20, Uganda: 12, Ghana: 21, Myanmar: 24, Nepal: 15,
  "Sri Lanka": 15, Chile: 17, Ecuador: 14, Guatemala: 9, Venezuela: 15,
  Kazakhstan: 17, Uzbekistan: 27, Belgium: 10, Sweden: 10, Portugal: 8,
  Greece: 8, Czechia: 9, Romania: 16, Hungary: 8, Israel: 8,
};

/** Military expenditure, billions of US dollars, ~2023. Rounded. */
const WORLD_MILITARY = {
  "United States of America": 916, China: 296, Russia: 109, India: 84,
  "Saudi Arabia": 76, "United Kingdom": 75, Germany: 67, Ukraine: 65,
  France: 61, Japan: 50, "South Korea": 48, Italy: 36, Australia: 32,
  Poland: 32, Israel: 27, Canada: 27, Spain: 24, Brazil: 23, Algeria: 18,
  Netherlands: 17, Turkey: 16, Colombia: 10, Indonesia: 9,
  Norway: 9, Sweden: 9, Belgium: 7, Mexico: 9, Pakistan: 8, Denmark: 8,
  Iran: 10, Qatar: 16, Kuwait: 12, Oman: 6, Greece: 8, Switzerland: 6,
  Thailand: 6, Vietnam: 6, Argentina: 4, "South Africa": 3, Egypt: 3,
  Chile: 5, Philippines: 4, Finland: 7, Portugal: 4, Austria: 4, Romania: 6,
  Czechia: 4, Hungary: 3, Morocco: 5, Nigeria: 3, Malaysia: 4,
  "New Zealand": 3, Ireland: 1,
};

/** Average residential electricity price, cents per kilowatt-hour, ~2023. */
const US_ELEC_PRICE = {
  Alabama: 15.0, Alaska: 24.5, Arizona: 14.2, Arkansas: 12.5, California: 27.5,
  Colorado: 14.5, Connecticut: 29.5, Delaware: 16.0,
  "District of Columbia": 17.5, Florida: 15.5, Georgia: 14.0, Hawaii: 42.0,
  Idaho: 11.0, Illinois: 15.5, Indiana: 14.5, Iowa: 13.0, Kansas: 14.0,
  Kentucky: 12.5, Louisiana: 12.0, Maine: 25.0, Maryland: 17.5,
  Massachusetts: 29.0, Michigan: 18.5, Minnesota: 14.5, Mississippi: 13.5,
  Missouri: 12.5, Montana: 12.0, Nebraska: 11.5, Nevada: 16.5,
  "New Hampshire": 26.0, "New Jersey": 18.5, "New Mexico": 14.0,
  "New York": 23.0, "North Carolina": 13.5, "North Dakota": 11.0, Ohio: 15.0,
  Oklahoma: 12.0, Oregon: 12.5, Pennsylvania: 17.5, "Rhode Island": 28.0,
  "South Carolina": 14.5, "South Dakota": 12.5, Tennessee: 12.5, Texas: 15.0,
  Utah: 11.0, Vermont: 21.0, Virginia: 14.0, Washington: 11.0,
  "West Virginia": 14.5, Wisconsin: 16.5, Wyoming: 11.5,
};

/** Cloud-to-ground lightning flashes per square kilometre per year. Estimates. */
const US_LIGHTNING = {
  Alabama: 10.5, Alaska: 0.1, Arizona: 4.5, Arkansas: 8.5, California: 0.6,
  Colorado: 4.0, Connecticut: 1.6, Delaware: 3.0, "District of Columbia": 3.0,
  Florida: 15.0, Georgia: 10.0, Hawaii: 0.4, Idaho: 1.6, Illinois: 5.5,
  Indiana: 5.0, Iowa: 5.0, Kansas: 6.5, Kentucky: 6.0, Louisiana: 13.0,
  Maine: 1.0, Maryland: 3.5, Massachusetts: 1.5, Michigan: 3.0,
  Minnesota: 3.5, Mississippi: 12.0, Missouri: 6.5, Montana: 1.6,
  Nebraska: 5.0, Nevada: 1.0, "New Hampshire": 1.2, "New Jersey": 3.0,
  "New Mexico": 5.5, "New York": 2.0, "North Carolina": 6.5,
  "North Dakota": 3.0, Ohio: 4.0, Oklahoma: 8.5, Oregon: 0.5,
  Pennsylvania: 3.0, "Rhode Island": 1.5, "South Carolina": 8.0,
  "South Dakota": 3.5, Tennessee: 6.5, Texas: 8.0, Utah: 2.0, Vermont: 1.2,
  Virginia: 4.0, Washington: 0.4, "West Virginia": 3.5, Wisconsin: 3.5,
  Wyoming: 3.0,
};

/** International tourist arrivals, millions, ~2023. Rounded estimates. */
const WORLD_TOURISTS = {
  France: 100, Spain: 85, "United States of America": 66, Italy: 57,
  Turkey: 55, Mexico: 42, "United Kingdom": 37, Germany: 35, Greece: 33,
  Austria: 30, Portugal: 27, Japan: 25, Canada: 18, Poland: 17,
  Netherlands: 20, Thailand: 28, "Saudi Arabia": 27, China: 35,
  "United Arab Emirates": 25, Malaysia: 20, Croatia: 18, Hungary: 16,
  Czechia: 13, Switzerland: 12, Morocco: 14, Vietnam: 13, India: 9,
  Indonesia: 12, Denmark: 12, Sweden: 8, Belgium: 9, Ireland: 11,
  "South Korea": 11, Egypt: 15, Australia: 7, Brazil: 6, Argentina: 6,
  "South Africa": 8, Philippines: 5, Norway: 6, Israel: 3, Bulgaria: 12,
  Romania: 2, "New Zealand": 3, Chile: 4, Peru: 2, Colombia: 6,
  "Dominican Rep.": 10, Tunisia: 9, Jordan: 6, Cuba: 2,
};

/** Average retail price of regular gasoline, dollars per gallon, ~2024. */
const US_GAS_PRICE = {
  Alabama: 2.95, Alaska: 3.75, Arizona: 3.45, Arkansas: 2.95, California: 4.75,
  Colorado: 3.15, Connecticut: 3.35, Delaware: 3.15,
  "District of Columbia": 3.55, Florida: 3.15, Georgia: 3.00, Hawaii: 4.65,
  Idaho: 3.55, Illinois: 3.45, Indiana: 3.25, Iowa: 3.05, Kansas: 2.95,
  Kentucky: 3.00, Louisiana: 2.90, Maine: 3.25, Maryland: 3.35,
  Massachusetts: 3.25, Michigan: 3.25, Minnesota: 3.05, Mississippi: 2.85,
  Missouri: 2.95, Montana: 3.35, Nebraska: 3.05, Nevada: 4.05,
  "New Hampshire": 3.20, "New Jersey": 3.25, "New Mexico": 3.05,
  "New York": 3.40, "North Carolina": 3.05, "North Dakota": 3.15, Ohio: 3.15,
  Oklahoma: 2.85, Oregon: 3.95, Pennsylvania: 3.50, "Rhode Island": 3.25,
  "South Carolina": 2.95, "South Dakota": 3.15, Tennessee: 2.95, Texas: 2.90,
  Utah: 3.45, Vermont: 3.35, Virginia: 3.10, Washington: 4.25,
  "West Virginia": 3.20, Wisconsin: 3.05, Wyoming: 3.25,
};

/** Age structure, percent of residents in each band, ~2022. Rounded to sum 100. */
const US_AGE_STRUCTURE = {
  Alabama: [22, 60, 18], Alaska: [24, 63, 13], Arizona: [22, 59, 19],
  Arkansas: [23, 59, 18], California: [22, 63, 15], Colorado: [21, 63, 16],
  Connecticut: [20, 61, 19], Delaware: [20, 59, 21],
  "District of Columbia": [18, 69, 13], Florida: [20, 58, 22],
  Georgia: [24, 62, 14], Hawaii: [20, 61, 19], Idaho: [25, 58, 17],
  Illinois: [22, 61, 17], Indiana: [23, 60, 17], Iowa: [23, 59, 18],
  Kansas: [24, 59, 17], Kentucky: [22, 60, 18], Louisiana: [23, 61, 16],
  Maine: [18, 58, 24], Maryland: [22, 62, 16], Massachusetts: [20, 62, 18],
  Michigan: [21, 60, 19], Minnesota: [22, 60, 18], Mississippi: [23, 60, 17],
  Missouri: [22, 60, 18], Montana: [21, 58, 21], Nebraska: [24, 60, 16],
  Nevada: [22, 62, 16], "New Hampshire": [18, 61, 21],
  "New Jersey": [21, 62, 17], "New Mexico": [22, 59, 19],
  "New York": [20, 62, 18], "North Carolina": [22, 61, 17],
  "North Dakota": [23, 61, 16], Ohio: [22, 60, 18], Oklahoma: [24, 59, 17],
  Oregon: [20, 61, 19], Pennsylvania: [20, 60, 20], "Rhode Island": [19, 61, 20],
  "South Carolina": [21, 60, 19], "South Dakota": [24, 59, 17],
  Tennessee: [22, 61, 17], Texas: [25, 62, 13], Utah: [29, 60, 11],
  Vermont: [18, 59, 23], Virginia: [22, 62, 16], Washington: [21, 62, 17],
  "West Virginia": [19, 59, 22], Wisconsin: [21, 60, 19], Wyoming: [23, 59, 18],
};

/** Educational attainment of adults 25+, percent, ~2022. Rounded to sum 100. */
const US_EDUCATION = {
  Alabama: [42, 32, 26], Alaska: [35, 39, 26], Arizona: [37, 34, 29],
  Arkansas: [45, 32, 23], California: [36, 30, 34], Colorado: [27, 32, 41],
  Connecticut: [33, 27, 40], Delaware: [37, 31, 32],
  "District of Columbia": [22, 20, 58], Florida: [37, 32, 31],
  Georgia: [37, 31, 32], Hawaii: [34, 33, 33], Idaho: [36, 36, 28],
  Illinois: [34, 30, 36], Indiana: [40, 33, 27], Iowa: [36, 34, 30],
  Kansas: [34, 34, 32], Kentucky: [42, 32, 26], Louisiana: [43, 32, 25],
  Maine: [34, 33, 33], Maryland: [30, 28, 42], Massachusetts: [29, 24, 47],
  Michigan: [35, 34, 31], Minnesota: [30, 32, 38], Mississippi: [44, 33, 23],
  Missouri: [37, 32, 31], Montana: [31, 35, 34], Nebraska: [33, 33, 34],
  Nevada: [40, 34, 26], "New Hampshire": [30, 30, 40],
  "New Jersey": [32, 26, 42], "New Mexico": [39, 34, 27],
  "New York": [33, 27, 40], "North Carolina": [35, 32, 33],
  "North Dakota": [31, 35, 34], Ohio: [37, 32, 31], Oklahoma: [40, 34, 26],
  Oregon: [31, 34, 35], Pennsylvania: [36, 30, 34], "Rhode Island": [34, 28, 38],
  "South Carolina": [38, 32, 30], "South Dakota": [33, 34, 33],
  Tennessee: [39, 32, 29], Texas: [38, 30, 32], Utah: [29, 36, 35],
  Vermont: [30, 30, 40], Virginia: [31, 29, 40], Washington: [29, 33, 38],
  "West Virginia": [45, 33, 22], Wisconsin: [34, 34, 32], Wyoming: [34, 38, 28],
};

// Station observations for the interpolated-surface maps. Only contiguous-48
// stations: the surface is built in projected pixel space, and the Alaska and
// Hawaii insets sit next to California in an Albers USA frame, so
// interpolating across them would paint those insets with mainland weather.
// Both maps therefore leave the two insets unshaded.

/** Mean annual precipitation, inches. */
const US_RAINFALL_STATIONS = [
  { lat: 47.61, lon: -122.33, value: 37 }, { lat: 45.52, lon: -122.68, value: 43 },
  { lat: 47.66, lon: -117.43, value: 17 }, { lat: 43.62, lon: -116.2, value: 12 },
  { lat: 39.53, lon: -119.81, value: 7 },  { lat: 37.77, lon: -122.42, value: 23 },
  { lat: 36.75, lon: -119.77, value: 11 }, { lat: 34.05, lon: -118.24, value: 15 },
  { lat: 32.72, lon: -117.16, value: 10 }, { lat: 36.17, lon: -115.14, value: 4 },
  { lat: 33.45, lon: -112.07, value: 8 },  { lat: 32.22, lon: -110.97, value: 12 },
  { lat: 40.76, lon: -111.89, value: 16 }, { lat: 39.74, lon: -104.99, value: 15 },
  { lat: 42.87, lon: -106.31, value: 13 }, { lat: 45.78, lon: -108.5, value: 14 },
  { lat: 46.87, lon: -113.99, value: 14 }, { lat: 35.08, lon: -106.65, value: 9 },
  { lat: 31.76, lon: -106.49, value: 9 },  { lat: 44.08, lon: -103.23, value: 17 },
  { lat: 46.81, lon: -100.78, value: 18 }, { lat: 46.88, lon: -96.79, value: 22 },
  { lat: 43.54, lon: -96.73, value: 26 },  { lat: 41.26, lon: -95.94, value: 30 },
  { lat: 41.59, lon: -93.62, value: 36 },  { lat: 44.98, lon: -93.27, value: 31 },
  { lat: 43.04, lon: -87.91, value: 35 },  { lat: 41.88, lon: -87.63, value: 37 },
  { lat: 42.33, lon: -83.05, value: 34 },  { lat: 41.5, lon: -81.69, value: 39 },
  { lat: 42.89, lon: -78.88, value: 40 },  { lat: 39.96, lon: -83.0, value: 40 },
  { lat: 39.77, lon: -86.16, value: 42 },  { lat: 38.63, lon: -90.2, value: 41 },
  { lat: 39.1, lon: -94.58, value: 39 },   { lat: 37.69, lon: -97.34, value: 33 },
  { lat: 35.47, lon: -97.52, value: 36 },  { lat: 32.78, lon: -96.8, value: 38 },
  { lat: 29.42, lon: -98.49, value: 33 },  { lat: 29.76, lon: -95.37, value: 50 },
  { lat: 29.95, lon: -90.07, value: 62 },  { lat: 30.69, lon: -88.04, value: 66 },
  { lat: 32.3, lon: -90.18, value: 55 },   { lat: 34.75, lon: -92.29, value: 51 },
  { lat: 35.15, lon: -90.05, value: 54 },  { lat: 36.16, lon: -86.78, value: 47 },
  { lat: 38.04, lon: -84.5, value: 46 },   { lat: 38.25, lon: -85.76, value: 45 },
  { lat: 33.52, lon: -86.81, value: 54 },  { lat: 33.75, lon: -84.39, value: 50 },
  { lat: 32.78, lon: -79.93, value: 50 },  { lat: 35.23, lon: -80.84, value: 43 },
  { lat: 35.78, lon: -78.64, value: 46 },  { lat: 37.54, lon: -77.44, value: 44 },
  { lat: 38.9, lon: -77.04, value: 40 },   { lat: 40.44, lon: -79.99, value: 38 },
  { lat: 39.95, lon: -75.17, value: 42 },  { lat: 40.71, lon: -74.01, value: 47 },
  { lat: 42.36, lon: -71.06, value: 44 },  { lat: 43.66, lon: -70.26, value: 47 },
  { lat: 44.48, lon: -73.21, value: 37 },  { lat: 30.33, lon: -81.66, value: 52 },
  { lat: 27.95, lon: -82.46, value: 46 },  { lat: 25.76, lon: -80.19, value: 62 },
];

/** Mean annual sunshine, hours. */
const US_SUNSHINE_STATIONS = [
  { lat: 47.61, lon: -122.33, value: 2170 }, { lat: 45.52, lon: -122.68, value: 2340 },
  { lat: 47.66, lon: -117.43, value: 2660 }, { lat: 43.62, lon: -116.2, value: 2990 },
  { lat: 39.53, lon: -119.81, value: 3350 }, { lat: 37.77, lon: -122.42, value: 3060 },
  { lat: 36.75, lon: -119.77, value: 3550 }, { lat: 34.05, lon: -118.24, value: 3250 },
  { lat: 32.72, lon: -117.16, value: 3050 }, { lat: 36.17, lon: -115.14, value: 3825 },
  { lat: 33.45, lon: -112.07, value: 3870 }, { lat: 32.22, lon: -110.97, value: 3800 },
  { lat: 40.76, lon: -111.89, value: 3030 }, { lat: 39.74, lon: -104.99, value: 3110 },
  { lat: 42.87, lon: -106.31, value: 2930 }, { lat: 45.78, lon: -108.5, value: 2960 },
  { lat: 46.87, lon: -113.99, value: 2540 }, { lat: 35.08, lon: -106.65, value: 3420 },
  { lat: 31.76, lon: -106.49, value: 3760 }, { lat: 44.08, lon: -103.23, value: 2900 },
  { lat: 46.81, lon: -100.78, value: 2730 }, { lat: 46.88, lon: -96.79, value: 2610 },
  { lat: 43.54, lon: -96.73, value: 2810 }, { lat: 41.26, lon: -95.94, value: 2750 },
  { lat: 41.59, lon: -93.62, value: 2730 }, { lat: 44.98, lon: -93.27, value: 2700 },
  { lat: 43.04, lon: -87.91, value: 2450 }, { lat: 41.88, lon: -87.63, value: 2500 },
  { lat: 42.33, lon: -83.05, value: 2320 }, { lat: 41.5, lon: -81.69, value: 2180 },
  { lat: 42.89, lon: -78.88, value: 2000 }, { lat: 39.96, lon: -83.0, value: 2280 },
  { lat: 39.77, lon: -86.16, value: 2500 }, { lat: 38.63, lon: -90.2, value: 2650 },
  { lat: 39.1, lon: -94.58, value: 2800 },  { lat: 37.69, lon: -97.34, value: 2900 },
  { lat: 35.47, lon: -97.52, value: 3080 }, { lat: 32.78, lon: -96.8, value: 2850 },
  { lat: 29.42, lon: -98.49, value: 2700 }, { lat: 29.76, lon: -95.37, value: 2600 },
  { lat: 29.95, lon: -90.07, value: 2650 }, { lat: 30.69, lon: -88.04, value: 2640 },
  { lat: 32.3, lon: -90.18, value: 2680 },  { lat: 34.75, lon: -92.29, value: 2770 },
  { lat: 35.15, lon: -90.05, value: 2800 }, { lat: 36.16, lon: -86.78, value: 2510 },
  { lat: 38.04, lon: -84.5, value: 2540 },  { lat: 38.25, lon: -85.76, value: 2510 },
  { lat: 33.52, lon: -86.81, value: 2640 }, { lat: 33.75, lon: -84.39, value: 2740 },
  { lat: 32.78, lon: -79.93, value: 2820 }, { lat: 35.23, lon: -80.84, value: 2800 },
  { lat: 35.78, lon: -78.64, value: 2700 }, { lat: 37.54, lon: -77.44, value: 2650 },
  { lat: 38.9, lon: -77.04, value: 2530 },  { lat: 40.44, lon: -79.99, value: 2020 },
  { lat: 39.95, lon: -75.17, value: 2550 }, { lat: 40.71, lon: -74.01, value: 2530 },
  { lat: 42.36, lon: -71.06, value: 2630 }, { lat: 43.66, lon: -70.26, value: 2600 },
  { lat: 44.48, lon: -73.21, value: 2050 }, { lat: 30.33, lon: -81.66, value: 2800 },
  { lat: 27.95, lon: -82.46, value: 2900 }, { lat: 25.76, lon: -80.19, value: 2900 },
];

// ---------------------------------------------------------------------------
// Formatters (no units — bare magnitudes keep the legend a fair, wordless hint)
// ---------------------------------------------------------------------------

const intComma = (n) => Math.round(n).toLocaleString("en-US");
const peopleMillions = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)}B` : m >= 100 ? `${Math.round(m)}M` : `${m}M`;
const peopleAbs = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(1)}M`;
const round0 = (n) => `${Math.round(n)}`;
const oneDec = (n) => n.toFixed(1);
// Keeps small magnitudes legible (0.1) without cluttering large ones (45).
const mixedDec = (n) => (Math.abs(n) >= 10 ? `${Math.round(n)}` : n.toFixed(1));
const thousandsK = (n) =>
  n >= 1000 ? `${Math.round(n / 1000)}k` : `${Math.round(n)}`;

// ---------------------------------------------------------------------------
// Map specs
// ---------------------------------------------------------------------------

const MAPS = [
  {
    id: "us-population",
    scope: "us",
    title: "Population by State (2020 Census)",
    aliases: ["population", "state population", "how many people live in each state", "residents per state"],
    description:
      "Resident population of each U.S. state from the 2020 United States Census. California, Texas, Florida, and New York are the most populous; Wyoming and Vermont the least. Boundaries: US Census TIGER via us-atlas (public domain).",
    hints: [
      "This is a straightforward head-count of people — not land, money, or altitude.",
      "The four darkest states are California, Texas, Florida, and New York.",
    ],
    data: US_POPULATION,
    interpolator: chromatic.interpolateBlues,
    scaleType: "sqrt",
    fmt: peopleAbs,
  },
  {
    id: "us-land-area",
    scope: "us",
    title: "Land Area by State (square miles)",
    aliases: ["land area", "area", "state size", "how big each state is", "size of each state"],
    description:
      "Land area of each U.S. state in square miles. Alaska dwarfs every other state, followed by Texas, California, and Montana; Rhode Island and Delaware are the smallest. Boundaries: US Census TIGER via us-atlas (public domain).",
    hints: [
      "This measures physical size on the ground, not how many people are there.",
      "One state in the far northwest is more than twice the size of the next largest.",
    ],
    data: US_LAND_AREA,
    interpolator: chromatic.interpolateGreens,
    scaleType: "sqrt",
    fmt: intComma,
  },
  {
    id: "us-statehood-order",
    scope: "us",
    title: "Order of Admission to the Union",
    aliases: ["order of statehood", "statehood order", "when each state joined the union", "order states joined the us", "admission to the union"],
    description:
      "The order in which each state was admitted to the Union, from Delaware (1st, 1787) to Hawaii (50th, 1959). The original thirteen colonies along the East Coast rank lowest; the West and the last frontier states rank highest. Boundaries: us-atlas (public domain).",
    hints: [
      "The lowest values cluster along the East Coast and climb as you move west.",
      "The thirteen original colonies hold the earliest ranks; Alaska and Hawaii the last two.",
    ],
    data: US_STATEHOOD_ORDER,
    interpolator: chromatic.interpolateOranges,
    scaleType: "linear",
    reverse: true,
    fmt: (n) => `${Math.round(n)}`,
  },
  {
    id: "us-electoral-votes",
    scope: "us",
    title: "Electoral Votes per State (2024)",
    aliases: ["electoral votes", "electoral college votes", "electoral college", "presidential electors"],
    description:
      "Number of Electoral College votes per state for the 2024 U.S. presidential election, based on the 2020 apportionment (House seats plus two senators; Washington, D.C. gets three). Ranges from 3 for the smallest states to 54 for California. Boundaries: us-atlas (public domain).",
    hints: [
      "The figure tracks a state's clout in choosing a national leader every four years.",
      "The smallest states all share the minimum of three; California tops out at 54.",
    ],
    data: US_ELECTORAL,
    interpolator: chromatic.interpolatePuBuGn,
    scaleType: "sqrt",
    fmt: (n) => `${Math.round(n)}`,
  },
  {
    id: "us-counties",
    scope: "us",
    title: "Number of Counties per State",
    aliases: ["number of counties", "counties per state", "how many counties", "count of counties"],
    description:
      "The number of counties (or county-equivalents — Louisiana's parishes, Alaska's boroughs and census areas, and independent cities) in each state. Texas leads with 254; Delaware has just 3. Boundaries: us-atlas (public domain).",
    hints: [
      "It counts a state's internal administrative subdivisions, not people or land.",
      "One large southern state has 254 of them; Delaware, Hawaii, and Rhode Island have a handful.",
    ],
    data: US_COUNTIES,
    interpolator: chromatic.interpolateYlOrBr,
    scaleType: "sqrt",
    fmt: (n) => `${Math.round(n)}`,
  },
  {
    id: "us-elevation",
    scope: "us",
    title: "Highest Elevation Point by State (feet)",
    aliases: ["highest elevation", "highest point", "peak elevation", "highest point in each state", "elevation", "highest summit"],
    description:
      "The elevation of the highest natural point in each state, in feet above sea level — from Alaska's Denali (20,310 ft) down to Florida's Britton Hill (345 ft). The Rockies and western ranges dominate. Boundaries: us-atlas (public domain).",
    hints: [
      "This is about how far up the land rises, greatest across the mountainous West.",
      "The single loftiest summit is in Alaska, while flat states like Florida and Delaware barely rise above the sea.",
    ],
    data: US_ELEVATION,
    interpolator: chromatic.interpolateYlGnBu,
    scaleType: "sqrt",
    fmt: intComma,
  },
  {
    id: "world-population",
    scope: "world",
    title: "Population by Country (~2020)",
    aliases: ["population", "country population", "how many people live in each country", "national population"],
    description:
      "Approximate national population around 2020. China and India each exceed 1.3 billion; a long tail of countries have only a few million. Grey countries are outside the labelled dataset. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "A simple count of people, nation by nation.",
      "Two countries in Asia tower over everyone else, each above a billion.",
    ],
    data: WORLD_POPULATION,
    interpolator: chromatic.interpolateBlues,
    scaleType: "sqrt",
    fmt: peopleMillions,
  },
  {
    id: "world-land-area",
    scope: "world",
    title: "Land Area by Country (thousand km²)",
    aliases: ["land area", "country area", "area", "how big each country is", "size of each country", "territory size"],
    description:
      "Land area by country, in thousands of square kilometres. Russia is by far the largest, followed by Canada, the United States, China, and Brazil. Grey countries are outside the labelled dataset. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "This is about sheer territorial size, not how many people live there.",
      "The largest by a wide margin stretches across northern Eurasia.",
    ],
    data: WORLD_AREA,
    interpolator: chromatic.interpolateGreens,
    scaleType: "sqrt",
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}M` : intComma(n)),
  },
  {
    id: "us-median-income",
    scope: "us",
    title: "Median Household Income by State (2022)",
    aliases: [
      "median household income",
      "household income",
      "median income",
      "typical family earnings",
      "average household earnings",
    ],
    description:
      "Median household income by state in 2022 dollars, from the U.S. Census Bureau's American Community Survey. The Washington–Boston corridor plus Maryland, Virginia, and the West Coast sit highest; Mississippi, West Virginia, and Arkansas lowest. Boundaries: us-atlas (public domain).",
    hints: [
      "The pattern follows money rather than land, weather, or head counts.",
      "The suburbs of the capital push Maryland and Virginia near the top, while Mississippi and West Virginia anchor the bottom.",
    ],
    data: US_MEDIAN_INCOME,
    interpolator: chromatic.interpolateBuGn,
    scaleType: "linear",
    fmt: thousandsK,
  },
  {
    id: "us-snowfall",
    scope: "us",
    title: "Average Annual Snowfall by State (inches)",
    aliases: [
      "annual snowfall",
      "average snowfall",
      "how much it snows each year",
      "inches of snow per year",
      "yearly snow total",
    ],
    description:
      "Approximate statewide average annual snowfall in inches, based on NOAA climate normals. Vermont, Maine, Wyoming, and the mountain West lead; the Gulf Coast and Florida are effectively at zero. Statewide averages smooth over big local extremes such as the Cascades and the Great Lakes belts. Boundaries: us-atlas (public domain).",
    hints: [
      "A winter weather measurement — along the Gulf Coast it barely registers at all.",
      "High-altitude and northern-tier states dominate; Vermont leads the East and Hawaii and Florida sit at the very bottom.",
    ],
    data: US_SNOWFALL,
    interpolator: chromatic.interpolateBlues,
    scaleType: "sqrt",
    fmt: mixedDec,
  },
  {
    id: "us-forest-cover",
    scope: "us",
    title: "Percent of Land Covered by Forest",
    aliases: [
      "forest cover",
      "percent forested",
      "tree cover",
      "share of land that is forest",
      "woodland cover",
    ],
    description:
      "Approximate share of each state's land area classified as forest land, per the USDA Forest Service's Forest Inventory and Analysis program. Maine is close to 90 percent; North Dakota and Nebraska are only a few percent. Boundaries: us-atlas (public domain).",
    hints: [
      "This is about what physically covers the ground, not who owns it or how high it rises.",
      "Northern New England and the Southeast run highest, while the Great Plains states are nearly bare.",
    ],
    data: US_FOREST,
    interpolator: chromatic.interpolateYlGn,
    scaleType: "linear",
    fmt: round0,
  },
  {
    id: "us-january-low",
    scope: "us",
    title: "Average January Low Temperature (°F)",
    aliases: [
      "average january low temperature",
      "january low temperature",
      "coldest month overnight low",
      "winter overnight low",
      "average winter low",
    ],
    description:
      "Approximate statewide average daily minimum temperature in January, in degrees Fahrenheit, based on NOAA 1991–2020 climate normals. Hawaii is near 66; North Dakota is near 2 and Alaska is below zero. Boundaries: us-atlas (public domain).",
    hints: [
      "A climate figure whose gradient runs almost perfectly with latitude.",
      "Exactly one state comes out negative — the one reaching into the Arctic — and the tropical outlier in the Pacific is warmer than anywhere else by a wide margin.",
    ],
    data: US_JAN_LOW,
    interpolator: chromatic.interpolateGnBu,
    scaleType: "linear",
    reverse: true,
    fmt: round0,
  },
  {
    id: "us-minimum-wage",
    scope: "us",
    title: "State Minimum Wage in 2024 (per hour)",
    aliases: [
      "minimum wage",
      "state minimum wage",
      "lowest legal hourly pay",
      "hourly pay floor",
      "minimum hourly pay",
    ],
    description:
      "Effective state minimum wage in 2024, in dollars per hour, from U.S. Department of Labor listings. Twenty states have no higher standard of their own and sit at the federal 7.25; Washington, D.C. tops the list at 17.50. Boundaries: us-atlas (public domain).",
    hints: [
      "Set by legislatures, not by nature — and roughly a third of the map sits at one identical value.",
      "A solid block of southern and plains states shares the federal figure of 7.25, while the Pacific coast, the Northeast, and the capital run far above it.",
    ],
    data: US_MIN_WAGE,
    interpolator: chromatic.interpolateGreens,
    scaleType: "linear",
    fmt: (n) => n.toFixed(2),
  },
  {
    id: "us-commute-time",
    scope: "us",
    title: "Average Commute Time to Work (minutes)",
    aliases: [
      "average commute time",
      "commute time",
      "travel time to work",
      "how long people travel to work",
      "commuting minutes",
    ],
    description:
      "Mean travel time to work for workers aged 16 and over, in minutes, from the 2022 American Community Survey. New York and Maryland top 33 minutes; the Dakotas and Wyoming are under 18. Boundaries: us-atlas (public domain).",
    hints: [
      "Measured in minutes, and it reflects daily routine rather than climate or terrain.",
      "The dense Northeast corridor is highest, the wide-open Dakotas lowest, and the whole spread is only about a quarter of an hour.",
    ],
    data: US_COMMUTE,
    interpolator: chromatic.interpolatePuBu,
    scaleType: "linear",
    fmt: oneDec,
  },
  {
    id: "us-life-expectancy",
    scope: "us",
    title: "Life Expectancy at Birth by State (years)",
    aliases: [
      "life expectancy",
      "average lifespan",
      "how long people live",
      "expected years of life",
      "average life span",
    ],
    description:
      "Life expectancy at birth in years, from CDC/NCHS state estimates for 2020. Hawaii leads at about 80.7 years and Mississippi trails at about 71.9 — a spread of under a decade nationwide. Boundaries: us-atlas (public domain).",
    hints: [
      "A public-health outcome, and the entire national range spans less than ten units.",
      "Hawaii, Minnesota, and the Pacific Northwest lead; the Deep South and Appalachia trail by several years.",
    ],
    data: US_LIFE_EXPECTANCY,
    interpolator: chromatic.interpolatePuBuGn,
    scaleType: "linear",
    fmt: oneDec,
  },
  {
    id: "us-wind-share",
    scope: "us",
    title: "Share of Electricity from Wind (%)",
    aliases: [
      "share of electricity from wind",
      "wind power share",
      "percent of power from wind",
      "wind energy share",
      "wind generation share",
    ],
    description:
      "Approximate share of each state's utility-scale electricity net generation supplied by wind in 2023, per the U.S. Energy Information Administration. Iowa and South Dakota exceed half; most of the Southeast is at or near zero. Boundaries: us-atlas (public domain).",
    hints: [
      "An electricity statistic — and across almost the whole Southeast it is essentially nil.",
      "A tall corridor from the Dakotas down through Iowa, Kansas, and Oklahoma dominates, thanks to relentless open-plains gusts.",
    ],
    data: US_WIND_SHARE,
    interpolator: chromatic.interpolateYlGnBu,
    scaleType: "sqrt",
    fmt: mixedDec,
  },
  {
    id: "us-corn-production",
    scope: "us",
    title: "Corn Production (million bushels, 2023)",
    aliases: [
      "corn production",
      "corn harvest",
      "bushels of corn",
      "corn output",
      "how much corn each state grows",
    ],
    description:
      "Approximate corn-for-grain production in millions of bushels for 2023, from USDA NASS crop production reports. Iowa and Illinois together account for roughly a third of the national crop; states with no reported corn-for-grain harvest are left unshaded. Boundaries: us-atlas (public domain).",
    hints: [
      "An agricultural output measure, and a tight cluster of Midwest states accounts for most of the national total.",
      "Iowa and Illinois are far ahead of everyone; the arid Southwest and New England barely register or report nothing at all.",
    ],
    data: US_CORN,
    interpolator: chromatic.interpolateYlOrBr,
    scaleType: "sqrt",
    fmt: intComma,
  },
  {
    id: "world-gdp-per-capita",
    scope: "world",
    title: "GDP per Capita by Country (~2022)",
    aliases: [
      "gdp per capita",
      "income per person",
      "gross domestic product per person",
      "output per person",
      "gdp per person",
    ],
    description:
      "Approximate GDP per capita in current U.S. dollars around 2022, based on World Bank figures. Luxembourg, Norway, Ireland, Switzerland, and Qatar sit above 85,000 while several countries in central Africa are under 1,000. Grey countries are outside the labelled dataset. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "An economic yardstick on which small states like Luxembourg and Qatar outrank far larger economies.",
      "The scale spans more than a factor of two hundred; central Africa is at the low end and northern Europe plus the Gulf at the high end.",
    ],
    data: WORLD_GDP_PC,
    interpolator: chromatic.interpolateYlGnBu,
    scaleType: "sqrt",
    fmt: thousandsK,
  },
  {
    id: "world-urban-share",
    scope: "world",
    title: "Urban Share of Population (%)",
    aliases: [
      "urban population share",
      "percent living in cities",
      "urbanization rate",
      "share of people in cities",
      "urbanisation",
    ],
    description:
      "Approximate share of the population living in urban areas around 2022, per World Bank data. Kuwait, Qatar, Belgium, and Uruguay are above 95 percent; Papua New Guinea, Burundi, Niger, and Sri Lanka are under 20. Grey countries are outside the labelled dataset. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "A demographic split about where inside a country people are settled, not how many of them there are.",
      "South America, Japan, and the Gulf run above 85 percent, while Sri Lanka, Nepal, Papua New Guinea, and much of East Africa stay below 30.",
    ],
    data: WORLD_URBAN,
    interpolator: chromatic.interpolateBuGn,
    scaleType: "linear",
    fmt: round0,
  },
  {
    id: "world-fertility-rate",
    scope: "world",
    title: "Births per Woman by Country (~2021)",
    aliases: [
      "fertility rate",
      "total fertility rate",
      "births per woman",
      "birth rate",
      "average number of children per woman",
      "children per woman",
    ],
    description:
      "Total fertility rate — the average number of children a woman would bear over her lifetime at current rates — around 2021, per World Bank data. Niger, Chad, and Somalia are above 6; South Korea is the world's lowest at about 0.8. Grey countries are outside the labelled dataset. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "A demographic rate that has fallen below the replacement level across nearly all of Europe and East Asia.",
      "The Sahel and central Africa sit at the top of the range, above six, while South Korea is the lowest on Earth at well under one.",
    ],
    data: WORLD_FERTILITY,
    interpolator: chromatic.interpolateYlOrBr,
    scaleType: "linear",
    fmt: oneDec,
  },

  // =========================================================================
  // Non-choropleth forms
  // =========================================================================

  {
    id: "us-pro-sports-teams",
    scope: "us",
    form: "symbol",
    title: "Major League Sports Franchises per State",
    aliases: [
      "major league sports teams",
      "professional sports teams",
      "number of pro sports teams",
      "sports franchises",
      "big four sports teams",
      "nfl nba mlb nhl teams",
      "pro teams per state",
    ],
    description:
      "Circles are area-scaled to the number of franchises in the four established North American leagues — football, basketball, baseball and ice hockey — playing their home games in each state for the 2024-25 seasons. California has 15, Florida 9, and New York and Texas 8 each; 24 states have none. Clubs are counted where their venue actually is, which puts both New York football clubs in New Jersey and the Washington football club in Maryland. Canadian franchises are excluded. Boundaries: us-atlas (public domain).",
    hints: [
      "The circles count organisations that play a scheduled season and sell tickets — not people, not acres, not money.",
      "One state has fifteen, Florida nine, and New York and Texas eight apiece; almost half the states have none at all.",
    ],
    data: US_PRO_TEAMS,
    symbolColor: "#1d4ed8",
    maxRadius: 34,
    fmt: (n) => `${Math.round(n)}`,
  },
  {
    id: "us-busiest-airports",
    scope: "us",
    form: "point-symbol",
    title: "Busiest U.S. Airports by Passengers (2023)",
    aliases: [
      "busiest airports",
      "airport passenger traffic",
      "how many passengers each airport handles",
      "airport traffic",
      "biggest airports",
      "passengers per airport",
      "busiest airports by passengers",
    ],
    description:
      "The thirty-one busiest U.S. airfields, drawn at their actual coordinates with circle area proportional to total passengers handled in 2023 (arrivals plus departures, in millions). Atlanta leads at about 104.7 million, ahead of Dallas–Fort Worth, Denver, Los Angeles and Chicago O'Hare. Totals are rounded reported figures. Boundaries: us-atlas (public domain).",
    hints: [
      "Each circle sits on a single facility rather than covering a whole state, and its size counts human beings passing through.",
      "The biggest bubble is on Atlanta, then Dallas–Fort Worth and Denver; New York and Washington each carry three separate circles.",
    ],
    places: US_AIRPORTS,
    symbolColor: "#0e7490",
    maxRadius: 30,
    fmt: (n) => `${Math.round(n)}M`,
  },
  {
    id: "us-tornadoes",
    scope: "us",
    form: "symbol",
    title: "Average Tornadoes per Year by State",
    aliases: [
      "tornadoes per year",
      "annual tornado count",
      "tornado frequency",
      "how many tornadoes each state gets",
      "tornado activity",
      "twisters per year",
      "average number of tornadoes",
    ],
    description:
      "Approximate average annual count of confirmed events per state from NOAA Storm Prediction Center records for 1991-2020, drawn as area-scaled circles. Texas averages about 155 a year, Kansas about 96 and Oklahoma about 68; Alaska and Rhode Island average well under one. Counts are rounded and are sensitive to reporting density. Boundaries: us-atlas (public domain).",
    hints: [
      "A weather tally, and the biggest circles run up a well-known alley through the middle of the country.",
      "Texas averages about 155 a year and Kansas about 96, while Alaska and Rhode Island average well under one.",
    ],
    data: US_TORNADOES,
    symbolColor: "#7c2d12",
    maxRadius: 32,
    fmt: (n) => (n >= 10 ? `${Math.round(n)}` : n.toFixed(1)),
  },
  {
    id: "us-farms",
    scope: "us",
    form: "dot",
    title: "Number of Farms by State",
    aliases: [
      "number of farms",
      "farms per state",
      "how many farms",
      "farm count",
      "count of farms",
      "agricultural holdings",
      "number of farms in each state",
    ],
    description:
      "A dot-density map: one dot per 2,000 separately operated holdings, scattered at random inside each state. Counts are approximate 2022 USDA Census of Agriculture figures; the national total is about 1.9 million. Texas has by far the most at roughly 231,000, followed by Missouri, Iowa and Oklahoma; Rhode Island and Alaska have about a thousand each. Dots are placed by a seeded random process and carry no sub-state meaning. Boundaries: us-atlas (public domain).",
    hints: [
      "Each dot stands for a fixed number of separately operated businesses working the land — this counts the businesses, not the acreage.",
      "Texas has by far the most, around 231,000; the dense band runs from the southern Plains up through Missouri, Iowa and Kentucky.",
    ],
    data: US_FARMS,
    dotUnit: 2000,
    dotColor: "#166534",
    fmt: intComma,
  },
  {
    id: "us-hogs",
    scope: "us",
    form: "dot",
    title: "Hogs and Pigs on Farms by State",
    aliases: [
      "hog inventory",
      "pigs per state",
      "number of pigs",
      "hog farming",
      "pig population",
      "swine inventory",
      "how many pigs each state has",
      "hogs",
    ],
    description:
      "A dot-density map with one dot per 150,000 head, from approximate USDA NASS December 2023 inventory. Iowa alone holds roughly a third of the national total of about 75 million, with Minnesota and North Carolina distant second and third. Dots are scattered at random inside each state by a seeded process and carry no sub-state meaning. Boundaries: us-atlas (public domain).",
    hints: [
      "One dot per fixed head-count of an animal raised mostly indoors and mostly for meat.",
      "Iowa alone holds about a third of the national total; Minnesota and North Carolina are the only other heavy clusters.",
    ],
    data: US_HOGS,
    dotUnit: 150000,
    dotColor: "#9d174d",
    fmt: intComma,
  },
  {
    id: "us-oil-production",
    scope: "us",
    form: "dot",
    title: "Crude Oil Production by State (2023)",
    aliases: [
      "crude oil production",
      "oil production",
      "how much oil each state produces",
      "petroleum output",
      "barrels of oil produced",
      "oil output",
      "oil drilling by state",
    ],
    description:
      "A dot-density map with one dot per 5 million barrels produced during 2023, from approximate U.S. Energy Information Administration state totals. Texas alone accounts for roughly half the onshore state total; New Mexico and North Dakota follow. Federal offshore production in the Gulf is not assigned to any state and is not shown. Dots are scattered at random within each state by a seeded process. Boundaries: us-atlas (public domain).",
    hints: [
      "Each dot represents a fixed volume pumped out of the ground over one year.",
      "One state accounts for roughly half the national figure; New Mexico and North Dakota come next, and nearly all of the East is empty.",
    ],
    data: US_OIL,
    dotUnit: 5,
    dotColor: "#1f2937",
    fmt: (n) => `${intComma(n)}M`,
  },
  {
    id: "us-cannabis-laws",
    scope: "us",
    form: "categorical",
    title: "State Cannabis Laws (2024)",
    aliases: [
      "cannabis legalization",
      "marijuana laws",
      "weed legality",
      "legal marijuana",
      "cannabis legality by state",
      "is marijuana legal",
      "pot laws",
      "recreational cannabis legality",
    ],
    description:
      "Three legal statuses under state law as of 2024: adult recreational plus medical use (24 states and the District of Columbia), medical use only (14 states), and neither (12 states). The whole West Coast and most of the Northeast are in the most permissive class; a block through the South and the Plains is in the strictest. The substance remains federally controlled regardless of state law. Boundaries: us-atlas (public domain).",
    hints: [
      "Three discrete statuses rather than a sliding scale — this is about what a legislature or a ballot measure has permitted.",
      "The entire West Coast and most of the Northeast share the most permissive class, while a dozen states through the South and Plains sit in the strictest.",
    ],
    data: US_CANNABIS,
    categories: [
      { key: "rec", label: "Adult use + medical", color: "#08519c" },
      { key: "med", label: "Medical only", color: "#6baed6" },
      { key: "none", label: "Neither", color: "#e2e8f0" },
    ],
  },
  {
    id: "us-electricity-source",
    scope: "us",
    form: "categorical",
    title: "Largest Source of Electricity by State (2023)",
    aliases: [
      "main electricity source",
      "largest source of electricity",
      "leading power source",
      "top electricity generation source",
      "what generates the most power in each state",
      "dominant energy source for power",
      "biggest source of electricity generation",
    ],
    description:
      "The single largest source of in-state utility-scale net generation in 2023, from EIA state electricity profiles. Natural gas leads in 25 states, coal in 10, nuclear in 6, hydro in 5, wind in 3, and burned oil in Hawaii alone. Several states are near-ties — Minnesota's four leading sources were within about three points of each other in 2023, and Colorado, Wisconsin, Maryland and North Carolina were close calls too. Boundaries: us-atlas (public domain).",
    hints: [
      "Six discrete classes describing where the current in the wires physically comes from.",
      "Hawaii is alone in its class, burning imported liquid fuel; Iowa, Kansas and South Dakota share a class the open plains made possible.",
    ],
    data: US_POWER_SOURCE,
    allowUncovered: ["District of Columbia"],
    categories: [
      { key: "gas", label: "Natural gas", color: "#e08214" },
      { key: "coal", label: "Coal", color: "#4d4d4d" },
      { key: "nuclear", label: "Nuclear", color: "#7b3294" },
      { key: "hydro", label: "Hydro", color: "#2b8cbe" },
      { key: "wind", label: "Wind", color: "#41ab5d" },
      { key: "petroleum", label: "Petroleum", color: "#b2182b" },
    ],
  },
  {
    id: "us-liquor-control",
    scope: "us",
    form: "categorical",
    title: "State-Controlled Liquor Sales",
    aliases: [
      "alcoholic beverage control states",
      "abc states",
      "state run liquor stores",
      "control states",
      "government liquor monopoly",
      "state liquor monopoly",
      "who sells spirits",
      "liquor control states",
    ],
    description:
      "Seventeen jurisdictions run a state agency that controls the wholesale and, in most cases, the retail distribution of distilled spirits; everywhere else spirits move entirely through private licensees. Utah, Idaho, Oregon and Montana in the West, then Iowa, Michigan, Ohio, Pennsylvania, Virginia and West Virginia, and New Hampshire, Vermont and Maine in the Northeast. Boundaries: us-atlas (public domain).",
    hints: [
      "Two classes, decided by statute: in one group a government agency stands between the distillery and the shelf.",
      "Seventeen states are in the smaller class — Utah, Idaho, Oregon and Montana out west, then a run through Ohio, Pennsylvania and Virginia up into northern New England.",
    ],
    data: US_LIQUOR_CONTROL,
    categories: [
      { key: "control", label: "State agency controls sales", color: "#4a1486" },
      { key: "licence", label: "Private licensees only", color: "#dcd6ec" },
    ],
  },
  {
    id: "us-death-penalty",
    scope: "us",
    form: "categorical",
    title: "States That Still Authorise Capital Punishment",
    aliases: [
      "death penalty",
      "capital punishment",
      "states with the death penalty",
      "is the death penalty legal",
      "execution laws",
      "death penalty status",
      "death penalty by state",
    ],
    description:
      "Twenty-seven state criminal codes still authorise the sentence; twenty-three states and the District of Columbia have abolished it. Several states in the first group, including California, Oregon and Pennsylvania, are under a governor's moratorium and are not carrying out sentences. Status as of 2024. Boundaries: us-atlas (public domain).",
    hints: [
      "A yes-or-no question answered by each state's criminal code rather than by any measurable quantity.",
      "Twenty-seven states are in the yes class. All of New England, everything north of Pennsylvania on the Atlantic, and most of the Upper Midwest are in the other.",
    ],
    data: US_DEATH_PENALTY,
    categories: [
      { key: "yes", label: "Authorised by statute", color: "#a50f15" },
      { key: "no", label: "Abolished", color: "#dbe5ee" },
    ],
  },
  {
    id: "us-right-to-work",
    scope: "us",
    form: "tilegrid",
    title: "Right-to-Work States",
    aliases: [
      "right to work laws",
      "right to work",
      "union security bans",
      "states with right to work laws",
      "labor union laws",
      "agency shop bans",
      "right to work states",
    ],
    description:
      "Each state is drawn as an equal-size square in a rough geographic grid. Twenty-six states have a statute barring union-security agreements that would require workers in an organised shop to pay dues or fees; the other 24 and the District of Columbia do not. Michigan's repeal took effect in February 2024. Rendered as a tile cartogram so that Rhode Island and Alaska carry the same visual weight. Boundaries: us-atlas (public domain).",
    hints: [
      "Every square is one state at equal size, and the two colours split them by a workplace statute — nothing geographic or economic.",
      "Twenty-six states are in one class: the whole South, the Plains and the Mountain West, plus Wisconsin and Iowa. Michigan left that group in 2024.",
    ],
    data: US_RIGHT_TO_WORK,
    categories: [
      { key: "yes", label: "Statute in force", color: "#e08214" },
      { key: "no", label: "No such statute", color: "#8073ac" },
    ],
  },
  {
    id: "us-sales-tax",
    scope: "us",
    form: "tilegrid",
    title: "State Sales Tax Rate (2024)",
    aliases: [
      "sales tax rate",
      "state sales tax",
      "sales tax",
      "how much sales tax each state charges",
      "consumption tax rate",
      "state sales tax rate",
      "purchase tax rate",
    ],
    description:
      "A tile cartogram: each state is an equal-size square shaded by its statewide general rate on retail purchases in 2024, in percent. California is highest at 7.25; Colorado has the lowest non-zero rate at 2.90; Alaska, Delaware, Montana, New Hampshire and Oregon levy none at the state level. Where a state imposes a mandatory statewide local add-on (Utah, Virginia, California) the combined statutory floor is shown; local option rates on top are not. Boundaries: us-atlas (public domain).",
    hints: [
      "Every square is one state and the shading is a percentage set by a legislature; five squares sit at exactly zero.",
      "California is highest at 7.25 and Colorado is the lowest non-zero at 2.90; Alaska, Delaware, Montana, New Hampshire and Oregon charge nothing.",
    ],
    data: US_SALES_TAX,
    interpolator: chromatic.interpolatePuRd,
    scaleType: "linear",
    fmt: (n) => n.toFixed(2),
  },
  {
    id: "us-obesity",
    scope: "us",
    form: "tilegrid",
    title: "Adult Obesity Rate by State",
    aliases: [
      "obesity rate",
      "adult obesity",
      "share of adults who are obese",
      "obesity prevalence",
      "percent of adults obese",
      "body mass index over 30",
      "adult obesity prevalence",
    ],
    description:
      "A tile cartogram of the approximate share of adults with a body mass index of 30 or more, from CDC Behavioral Risk Factor Surveillance System estimates for 2022. West Virginia, Louisiana, Oklahoma and Alabama are around 40 percent; the District of Columbia, Colorado and Hawaii are lowest at about 24 to 26. The survey is self-reported, so the absolute level is understated even though the ranking is stable. Boundaries: us-atlas (public domain).",
    hints: [
      "A self-reported public-health percentage that has climbed almost everywhere over the past thirty years.",
      "West Virginia, Louisiana, Oklahoma and Alabama are around 40 percent; Colorado, Hawaii and the District of Columbia are lowest, near 25.",
    ],
    data: US_OBESITY,
    interpolator: chromatic.interpolateOrRd,
    scaleType: "linear",
    fmt: oneDec,
  },
  {
    id: "us-nuclear-plants",
    scope: "us",
    form: "points",
    title: "Operating Nuclear Power Plants",
    aliases: [
      "nuclear power plants",
      "nuclear reactors",
      "where the nuclear plants are",
      "atomic power stations",
      "nuclear power stations",
      "nuclear plants",
      "locations of nuclear power plants",
    ],
    description:
      "One marker per licensed and operating commercial station. Most sites host two or three reactors, so these 52 markers stand for more than ninety units; the adjacent Salem/Hope Creek and Nine Mile Point/FitzPatrick pairs are drawn as one marker each. Retired stations — Indian Point, Palisades, Three Mile Island, Duane Arnold, San Onofre and others — are not shown. The distribution is heavily eastern: only three sites lie west of the Rockies, in Arizona, California and Washington. Boundaries: us-atlas (public domain).",
    hints: [
      "Each dot is one industrial site, and every one of them sits beside a river, a lake or the sea for the same practical reason.",
      "There are more than fifty and they crowd the eastern half of the country; only three sit west of the Rockies, in Arizona, California and Washington.",
    ],
    places: US_NUCLEAR_SITES,
    pointColor: "#b91c1c",
    pointRadius: 5,
  },
  {
    id: "us-national-parks",
    scope: "us",
    form: "points",
    title: "Locations of the National Parks",
    aliases: [
      "national parks",
      "where the national parks are",
      "national park locations",
      "us national parks",
      "list of national parks",
      "national park sites",
    ],
    description:
      "All 63 units of the National Park System that carry the full designation, plotted at their approximate centres. Two — American Samoa and the Virgin Islands — fall outside the projection and are dropped, leaving 61 markers. California has nine, Alaska eight and Utah five; a broad swathe from the southern Plains through the Midwest to the Atlantic has almost none. Boundaries: us-atlas (public domain).",
    hints: [
      "Sixty-odd protected places, each designated by an act of Congress; two of them fall outside this projection entirely.",
      "California has nine, Alaska eight and Utah five, while a wide band from Texas up through the Midwest and across to the Atlantic is nearly empty.",
    ],
    places: US_NATIONAL_PARKS,
    pointColor: "#15803d",
    pointRadius: 5,
  },
  {
    id: "us-air-routes",
    scope: "us",
    form: "flow",
    title: "Busiest Domestic Air Routes",
    aliases: [
      "busiest flight routes",
      "busiest air routes",
      "most travelled flight paths",
      "top airline routes",
      "busiest domestic flights",
      "most popular flight routes",
      "heaviest passenger routes",
    ],
    description:
      "The heaviest domestic origin-and-destination markets, drawn as arcs between the two airfields (routes to Hawaii and Alaska are left out, because an arc into a projection inset would be meaningless) with width scaled to approximate annual round-trip passengers in millions. Los Angeles–New York is the single heaviest link, and dense fans radiate from Los Angeles and from Atlanta. The ranking is the point of the map; the individual volumes are rounded estimates. Boundaries: us-atlas (public domain).",
    hints: [
      "The lines are not rivers, roads or cables — each one joins a pair of places, and it is drawn thicker when more people make that particular trip.",
      "The single heaviest link joins Los Angeles and New York; the two densest fans radiate from Los Angeles and from Atlanta.",
    ],
    flows: US_AIR_ROUTES,
    flowColor: "#1d4ed8",
    maxWidth: 9,
    fmt: oneDec,
  },
  {
    id: "us-income-lifespan",
    scope: "us",
    form: "bivariate",
    title: "Household Income and Life Expectancy Together",
    aliases: [
      "income and life expectancy",
      "wealth and lifespan",
      "money and life expectancy",
      "income versus life expectancy",
      "earnings and longevity",
      "income and longevity",
      "household income and lifespan",
    ],
    description:
      "A bivariate choropleth: each state is placed into one of three bands on each of two variables and coloured from the resulting three-by-three matrix. The horizontal axis is median household income (2022 American Community Survey) and the vertical axis is life expectancy at birth (CDC/NCHS 2020 estimates). Mississippi, West Virginia, Arkansas and Alabama sit low on both; Massachusetts, Minnesota, New Hampshire and Colorado sit high on both. Hawaii is the standout: mid-range on one axis, top of the country on the other. Boundaries: us-atlas (public domain).",
    hints: [
      "The nine-square key gives it away that two separate quantities are being combined here, not one.",
      "The two things combined are the pair an accountant and a doctor would each claim as their own; Mississippi and West Virginia are at the bottom of both, Massachusetts and Minnesota near the top of both.",
    ],
    dataX: US_MEDIAN_INCOME,
    dataY: US_LIFE_EXPECTANCY,
  },
  {
    id: "us-federal-land",
    scope: "us",
    title: "Share of Each State Owned by the Federal Government",
    aliases: [
      "federal land ownership",
      "percent of land owned by the federal government",
      "federal land share",
      "government owned land",
      "public land share",
      "federally owned land",
      "share of land owned by washington",
    ],
    description:
      "Approximate share of each state's total area held by the five major federal land agencies, from Congressional Research Service compilations. Nevada is over 80 percent and Utah, Idaho and Alaska over 60; Connecticut, Iowa and Rhode Island are under half a percent. The split follows the history of how the public domain was disposed of, not the modern economy. Boundaries: us-atlas (public domain).",
    hints: [
      "A question of who holds the title deed, not of what grows there, who lives there, or how high it rises.",
      "Nevada is over 80 percent, Utah, Idaho and Alaska over 60; Connecticut, Iowa and Rhode Island are under half of one percent.",
    ],
    data: US_FEDERAL_LAND,
    interpolator: chromatic.interpolateBuPu,
    scaleType: "sqrt",
    fmt: mixedDec,
  },
  {
    id: "us-alcohol",
    scope: "us",
    title: "Alcohol Consumed per Person",
    aliases: [
      "alcohol consumption per capita",
      "drinking per person",
      "how much alcohol people drink",
      "per capita alcohol consumption",
      "alcohol consumption",
      "booze consumption",
      "drinking rates by state",
    ],
    description:
      "Approximate gallons of pure ethanol consumed per resident aged 14 and over, from NIAAA surveillance estimates. New Hampshire is far ahead of everywhere else and Delaware and the District of Columbia are also inflated, because all three sell heavily to people who live across the state line. Utah is the clear lowest, at under a third of New Hampshire's figure. Boundaries: us-atlas (public domain).",
    hints: [
      "A per-person quantity where two very small states come out on top mainly because their neighbours cross the border to buy.",
      "New Hampshire is far above everyone else; Utah is the clear lowest, at under a third of New Hampshire's figure.",
    ],
    data: US_ALCOHOL,
    interpolator: chromatic.interpolateRdPu,
    scaleType: "linear",
    fmt: (n) => n.toFixed(1),
  },
  {
    id: "world-heritage-sites",
    scope: "world",
    form: "symbol",
    title: "UNESCO World Heritage Sites per Country",
    aliases: [
      "world heritage sites",
      "unesco sites",
      "unesco world heritage sites",
      "number of world heritage sites",
      "heritage sites per country",
      "unesco listings",
      "world heritage listings",
    ],
    description:
      "Area-scaled circles for the 33 countries with ten or more inscriptions after the 2024 session of the committee. Italy (60) and China (59) lead, then Germany, France and Spain; India is the largest outside Europe and East Asia. Only one country in Africa reaches ten. Countries below the threshold carry no circle. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "A count of designations handed out by a United Nations body; circles are drawn only for countries with ten or more of them.",
      "Italy and China lead with about sixty each, then Germany, France and Spain — and the whole of Africa contributes a single circle, in the far south.",
    ],
    data: WORLD_HERITAGE,
    symbolColor: "#a16207",
    maxRadius: 21,
    fmt: (n) => `${Math.round(n)}`,
  },
  {
    id: "world-co2-emissions",
    scope: "world",
    form: "symbol",
    title: "Carbon Dioxide Emissions by Country",
    aliases: [
      "co2 emissions",
      "carbon emissions",
      "carbon dioxide emissions",
      "greenhouse gas emissions",
      "annual carbon output",
      "emissions per country",
      "national carbon dioxide emissions",
    ],
    description:
      "Approximate territorial emissions from fossil fuels and industry, in millions of tonnes per year around 2022-2023, drawn as area-scaled circles. China is more than twice the next largest; the United States is second, India third and Russia fourth. Figures are rounded estimates and countries below roughly five million tonnes are omitted because their symbols would be invisible. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "Circle area is proportional to an annual national output that climate negotiators spend their careers arguing over.",
      "One country's circle is more than twice the next largest; the United States is second, India third and Russia fourth.",
    ],
    data: WORLD_CO2,
    symbolColor: "#374151",
    maxRadius: 30,
    fmt: intComma,
  },
  {
    id: "world-driving-side",
    scope: "world",
    form: "categorical",
    title: "Which Side of the Road People Drive On",
    aliases: [
      "driving side",
      "left hand traffic",
      "which side of the road",
      "side of the road people drive on",
      "right hand traffic",
      "left or right hand driving",
      "traffic side",
      "countries that drive on the left",
    ],
    description:
      "Two classes covering every country in the boundary file. Thirty-seven keep to one side and the rest to the other; the smaller group is largely a legacy of British colonial road rules, plus Japan, Thailand, Indonesia and Suriname. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "Two classes, and the smaller one is mostly a legacy of a single empire's road rules — plus a few countries that never belonged to it.",
      "The smaller class holds Japan, India, Australia, southern Africa and the British Isles; continental Europe, the Americas and China are all in the other.",
    ],
    data: WORLD_DRIVING_SIDE,
    categories: [
      { key: "left", label: "Keep left", color: "#3b6ea5" },
      { key: "right", label: "Keep right", color: "#e8c39e" },
    ],
  },
  {
    id: "world-mains-voltage",
    scope: "world",
    form: "categorical",
    title: "Household Mains Voltage",
    aliases: [
      "mains voltage",
      "electrical voltage",
      "household voltage",
      "plug voltage",
      "domestic electricity voltage",
      "wall socket voltage",
      "mains electricity standard",
      "electricity voltage by country",
    ],
    description:
      "Two nominal standards for domestic supply: roughly 100-127 V in North and Central America, the Caribbean, northern South America, Japan and Taiwan, and roughly 220-240 V nearly everywhere else. Brazil is deliberately left unshaded because it uses both, region by region. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "Two engineering standards about a factor of two apart, and which one you are in decides whether a travel adapter also needs to be a converter.",
      "North America, most of Central America, the Caribbean, Japan and Taiwan share the lower standard; Brazil is left blank because it uses both.",
    ],
    data: WORLD_VOLTAGE,
    allowUncovered: ["Brazil"],
    categories: [
      { key: "low", label: "About 100-127 V", color: "#d95f02" },
      { key: "high", label: "About 220-240 V", color: "#1b9e77" },
    ],
  },
  {
    id: "world-monarchies",
    scope: "world",
    form: "categorical",
    title: "Countries With a Monarch as Head of State",
    aliases: [
      "monarchies",
      "monarchy",
      "countries with a king or queen",
      "which countries have a monarch",
      "kingdoms",
      "monarchies of the world",
      "constitutional monarchies",
      "royal heads of state",
    ],
    description:
      "Thirty-one countries in the boundary file have a hereditary head of state, counting the Commonwealth realms that share one. The group spans northern Europe, the Gulf, South-East Asia, Morocco, Lesotho, eSwatini and the realms in the Americas and the Pacific. Micro-states below the resolution of the 110m file (Liechtenstein, Monaco, Andorra, Tonga and others) are not represented. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "A yes-or-no about how a country's ceremonial top job is filled — by inheritance rather than by any kind of vote.",
      "Thirty-one countries are in the smaller class, among them Japan, Thailand, Morocco, Sweden, Canada and Australia.",
    ],
    data: WORLD_MONARCHY,
    categories: [
      { key: "monarchy", label: "Hereditary head of state", color: "#8c510a" },
      { key: "republic", label: "Elected head of state", color: "#c7eae5" },
    ],
  },
  {
    id: "world-megacities",
    scope: "world",
    form: "points",
    title: "Cities With More Than Ten Million People",
    aliases: [
      "megacities",
      "largest cities in the world",
      "biggest cities",
      "cities over ten million",
      "world megacities",
      "largest urban areas",
      "biggest urban agglomerations",
    ],
    description:
      "The 33 urban agglomerations that the UN's World Urbanization Prospects counted above ten million residents, each drawn as a single marker. Asia holds more than half of them; sub-Saharan Africa has two, and North America three. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "Thirty-three markers, each one a single settlement rather than a whole country, all sitting above the same round threshold.",
      "Asia holds more than half of them; the African ones are Cairo, Lagos and Kinshasa, and there are only three in North America.",
    ],
    places: WORLD_MEGACITIES,
    pointColor: "#be123c",
    pointRadius: 5,
  },
  // --- Diverging: colour turns at a midpoint -------------------------------
  {
    id: "us-population-change",
    scope: "us",
    form: "diverging",
    title: "Population Change, 2010 to 2020",
    aliases: ["population change", "population growth", "how much each state grew", "change in population", "state growth rate", "population gain or loss"],
    description:
      "Percent change in resident population between the 2010 and 2020 Censuses. Utah, Idaho and Texas grew fastest; only West Virginia, Mississippi and Illinois finished the decade smaller than they started it. Boundaries: us-atlas (public domain).",
    hints: [
      "Three states sit on the far side of the midpoint from everyone else — whatever is measured here, they lost it over ten years.",
      "The three that fell are West Virginia, Mississippi and Illinois; Utah rose most.",
    ],
    data: US_POP_CHANGE,
    midpoint: 0,
    interpolator: chromatic.interpolateBrBG,
    fmt: (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`,
  },
  {
    id: "us-net-migration",
    scope: "us",
    form: "diverging",
    title: "Net Domestic Migration",
    aliases: ["net migration", "domestic migration", "people moving between states", "where americans are moving", "interstate migration", "net movers"],
    description:
      "Net movement of people between states per 1,000 residents around 2022-23: arrivals from elsewhere in the country minus departures to it, ignoring births, deaths and immigration from abroad. South Carolina, Idaho and Delaware gained most; New York, California and Illinois lost most. Values are rounded estimates rather than exact published counts. Boundaries: us-atlas (public domain).",
    hints: [
      "Nobody is born or dies in this measure and nobody arrives from abroad — it only counts a choice already-resident people made.",
      "New York is deepest on one side, South Carolina deepest on the other.",
    ],
    data: US_NET_MIGRATION,
    midpoint: 0,
    interpolator: chromatic.interpolatePuOr,
    reverse: true,
    fmt: (n) => `${n > 0 ? "+" : ""}${Math.round(n)}`,
  },
  {
    id: "world-population-growth",
    scope: "world",
    form: "diverging",
    title: "Annual Population Growth Rate",
    aliases: ["population growth rate", "how fast the population is growing", "annual population change", "population growth", "rate of population increase"],
    description:
      "Approximate annual rate of change in national population around 2022, in percent. Niger, DR Congo and several Sahel states exceed three percent a year; Japan, Italy, Bulgaria and the Baltics are shrinking. Countries without a figure are unshaded. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "A band across the middle of Africa sits at one extreme and much of Europe plus Japan at the other, with the midpoint meaning no change at all.",
      "Niger is the highest in the world; Bulgaria, Latvia and Japan are among the lowest.",
    ],
    data: WORLD_POP_GROWTH,
    midpoint: 0,
    interpolator: chromatic.interpolateRdYlBu,
    reverse: true,
    fmt: (n) => `${n > 0 ? "+" : ""}${n.toFixed(1)}`,
  },

  // --- Classed: quantile bins with a stepped legend -------------------------
  {
    id: "us-uninsured",
    scope: "us",
    form: "classed",
    title: "Share of People Without Health Insurance",
    aliases: ["uninsured rate", "people without health insurance", "health insurance coverage", "share uninsured", "no health cover", "lack of health insurance"],
    description:
      "Percent of residents under 65 with no health coverage of any kind, around 2022, sorted into five equal-count classes. Texas is highest at about 18 percent; Massachusetts is lowest at under 3. Boundaries: us-atlas (public domain).",
    hints: [
      "Five classes, each holding the same number of states — and the two extremes differ by roughly a factor of six.",
      "Texas sits alone in the top class; Massachusetts is the lowest in the country.",
    ],
    data: US_UNINSURED,
    classCount: 5,
    interpolator: chromatic.interpolateOrRd,
    fmt: oneDec,
  },
  {
    id: "us-homeownership",
    scope: "us",
    form: "classed",
    title: "Homeownership Rate",
    aliases: ["homeownership rate", "share of homes that are owned", "owner occupied housing", "how many people own their home", "home ownership", "share of households owning"],
    description:
      "Percent of occupied housing units lived in by their owner rather than rented, around 2023, in five equal-count classes. West Virginia and Maine are highest; the District of Columbia and New York are lowest. Boundaries: us-atlas (public domain).",
    hints: [
      "The measure is about tenure, not price or size — every household counts as one of exactly two kinds.",
      "West Virginia and Maine top the list; the District of Columbia is far below every state.",
    ],
    data: US_HOMEOWNERSHIP,
    classCount: 5,
    interpolator: chromatic.interpolateBuGn,
    fmt: oneDec,
  },
  {
    id: "world-median-age",
    scope: "world",
    form: "classed",
    title: "Median Age",
    aliases: ["median age", "average age", "how old the population is", "age of the population", "median age of the population"],
    description:
      "The age that splits each country's population in half, around 2023, in six equal-count classes. Niger is about 15, Japan about 49. Countries without a figure are unshaded. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "Half of each country is above the shaded number and half below it.",
      "Japan and Italy are in the top class; Niger and Mali are in the bottom one.",
    ],
    data: WORLD_MEDIAN_AGE,
    classCount: 6,
    interpolator: chromatic.interpolateViridis,
    reverse: true,
    fmt: round0,
  },

  // --- Cartogram: each shape shrunk toward its own centroid -----------------
  {
    id: "us-gdp",
    scope: "us",
    form: "cartogram",
    title: "State Economy Size",
    aliases: ["state gdp", "size of the economy", "economic output", "gross domestic product", "economy size", "total economic output"],
    description:
      "Gross domestic product by state around 2023, in billions of dollars, drawn so each state's area is proportional to its output. California alone is close to four trillion dollars; Vermont and Wyoming are under sixty billion. Figures are rounded. Boundaries: us-atlas (public domain).",
    hints: [
      "Each state keeps its own outline and place but shrinks toward its middle — the gap to the faint shape behind it is the quantity.",
      "California is by far the largest, then Texas and New York; Vermont and Wyoming are the smallest.",
    ],
    data: US_GDP,
    symbolColor: "#1d4ed8",
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}T` : `${Math.round(n)}B`),
  },
  {
    id: "us-veterans",
    scope: "us",
    form: "cartogram",
    title: "Number of Military Veterans",
    aliases: ["veterans", "military veterans", "number of veterans", "veteran population", "people who served in the military", "former service members"],
    description:
      "Approximate number of living military veterans by state around 2022, in thousands, drawn with each state's area proportional to the count. California, Texas and Florida each hold roughly 1.4 million. Values are rounded estimates. Boundaries: us-atlas (public domain).",
    hints: [
      "The count is of people who once held a particular job, not of anyone currently doing it.",
      "California, Texas and Florida are nearly tied at the top; Virginia is unusually large for its population.",
    ],
    data: US_VETERANS,
    symbolColor: "#0f766e",
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}M` : `${Math.round(n)}k`),
  },
  {
    id: "world-military-spending",
    scope: "world",
    form: "cartogram",
    title: "Military Spending",
    aliases: ["military spending", "defence spending", "defense budget", "arms spending", "how much countries spend on their military", "military expenditure"],
    description:
      "Approximate military expenditure around 2023 in billions of US dollars, drawn with each country's area proportional to the total. The United States is larger than the next several combined. Countries without a figure are unshaded. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "One country's shape barely shrinks at all while everyone else collapses toward a dot.",
      "The United States is roughly three times China and eight times Russia here.",
    ],
    data: WORLD_MILITARY,
    symbolColor: "#7f1d1d",
    fmt: (n) => `${Math.round(n)}B`,
  },

  // --- Dorling: area-scaled circles pushed apart ----------------------------
  {
    id: "us-k12-enrollment",
    scope: "us",
    form: "dorling",
    title: "Public School Enrollment",
    aliases: ["public school enrollment", "school enrollment", "number of school children", "students in public schools", "k-12 enrollment", "schoolchildren"],
    description:
      "Approximate number of pupils in public elementary and secondary schools by state around 2022, in thousands, drawn as area-scaled circles nudged apart so small states stay visible. California and Texas each exceed five million. Values are rounded. Boundaries: us-atlas (public domain).",
    hints: [
      "Everyone counted here is under about eighteen and attending somewhere public.",
      "California and Texas dwarf the rest; Vermont and Wyoming are the smallest circles.",
    ],
    data: US_K12,
    symbolColor: "#b45309",
    maxRadius: 34,
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}M` : `${Math.round(n)}k`),
  },
  {
    id: "us-college-enrollment",
    scope: "us",
    form: "dorling",
    title: "Higher Education Enrollment",
    aliases: ["college enrollment", "university enrollment", "higher education enrollment", "number of college students", "students in college", "undergraduate and graduate enrollment"],
    description:
      "Approximate enrollment at degree-granting colleges and universities by state around 2022, in thousands. California is well over two million; Wyoming and Vermont are under fifty thousand. Values are rounded. Boundaries: us-atlas (public domain).",
    hints: [
      "Everyone counted here has already finished school and chosen to keep going.",
      "The District of Columbia is far larger here than its population would suggest.",
    ],
    data: US_COLLEGE,
    symbolColor: "#6d28d9",
    maxRadius: 34,
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}M` : `${Math.round(n)}k`),
  },
  {
    id: "world-internet-users",
    scope: "world",
    form: "dorling",
    title: "Number of Internet Users",
    aliases: ["internet users", "people online", "number of people using the internet", "internet population", "how many people are online"],
    description:
      "Approximate number of people online by country around 2023, in millions, drawn as area-scaled circles. China and India together account for close to two billion. Countries without a figure are unshaded. Values are rounded estimates. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "This is a raw head-count, not a percentage, so the biggest countries lead almost automatically.",
      "China is the largest circle, then India, then the United States.",
    ],
    data: WORLD_INTERNET_USERS,
    symbolColor: "#0e7490",
    maxRadius: 30,
    fmt: (n) => `${Math.round(n)}M`,
  },

  // --- Spike: height as a linear channel ------------------------------------
  {
    id: "us-electricity-price",
    scope: "us",
    form: "spike",
    title: "Residential Electricity Price",
    aliases: ["electricity price", "cost of electricity", "power prices", "price per kilowatt hour", "electricity cost", "how much electricity costs"],
    description:
      "Average price households pay for electricity around 2023, in cents per kilowatt-hour. Hawaii is roughly four times the cheapest states; Connecticut, Massachusetts and Rhode Island are the highest on the mainland. Boundaries: us-atlas (public domain).",
    hints: [
      "One island state towers over everything, and a cluster in the far Northeast comes next.",
      "Hawaii is about 42 and Idaho, Utah and Washington are around 11.",
    ],
    data: US_ELEC_PRICE,
    symbolColor: "#c2410c",
    maxSpike: 130,
    fmt: oneDec,
  },
  {
    id: "us-gas-price",
    scope: "us",
    form: "spike",
    title: "Average Gasoline Price",
    aliases: ["gas prices", "gasoline price", "petrol price", "price of gas", "fuel price", "cost of gasoline", "price at the pump"],
    description:
      "Approximate average retail price of a gallon of regular around 2024. The West Coast and Hawaii run well above the Gulf states, largely because of taxes and refinery isolation. Prices move constantly, so treat these as a snapshot rather than a current quote. Boundaries: us-atlas (public domain).",
    hints: [
      "The whole Pacific edge stands tall and the Gulf coast sits flat, and the gap is mostly tax and distance from a refinery.",
      "California and Hawaii are near the top; Mississippi, Oklahoma and Texas near the bottom.",
    ],
    data: US_GAS_PRICE,
    symbolColor: "#166534",
    maxSpike: 120,
    fmt: (n) => n.toFixed(2),
  },
  {
    id: "us-lightning",
    scope: "us",
    form: "spike",
    title: "Lightning Strike Density",
    aliases: ["lightning", "lightning strikes", "thunderstorm frequency", "lightning density", "how often lightning strikes", "lightning flashes"],
    description:
      "Approximate cloud-to-ground flashes per square kilometre per year. Florida and the Gulf coast lead by a wide margin; the Pacific Northwest and Alaska almost never see it. Values are estimates rounded from strike-density climatology. Boundaries: us-atlas (public domain).",
    hints: [
      "Warm wet air and afternoon heat drive this, so it collapses to nothing along the cool Pacific coast.",
      "Florida is the highest by far, then Louisiana and Mississippi; Oregon, Washington and Alaska are near zero.",
    ],
    data: US_LIGHTNING,
    symbolColor: "#a16207",
    maxSpike: 120,
    fmt: oneDec,
  },
  {
    id: "world-tourists",
    scope: "world",
    form: "spike",
    title: "International Tourist Arrivals",
    aliases: ["tourist arrivals", "international tourists", "number of visitors", "tourism", "foreign visitors", "how many tourists visit"],
    description:
      "Approximate international arrivals around 2023, in millions. France and Spain lead; the Mediterranean rim as a whole takes an outsized share. Countries without a figure are unshaded and values are rounded estimates. Boundaries: Natural Earth via world-atlas (public domain).",
    hints: [
      "Everyone counted crossed a border and then went home again.",
      "France is first and Spain second; Mexico and Turkey both outrank the United Kingdom.",
    ],
    data: WORLD_TOURISTS,
    symbolColor: "#9d174d",
    maxSpike: 110,
    fmt: (n) => `${Math.round(n)}M`,
  },

  // --- Composition: a pie per state on the tile grid ------------------------
  {
    id: "us-age-structure",
    scope: "us",
    form: "composition",
    title: "Age Structure of the Population",
    aliases: ["age structure", "age distribution", "age breakdown", "how old the population is", "share of children and seniors", "population by age group", "age composition"],
    description:
      "Share of residents in three bands — under 18, 18 to 64, and 65 and over — around 2022. Utah has the largest young share in the country; Maine, Florida and Vermont the largest old one. Each pie is rounded to sum to 100. Boundaries: us-atlas (public domain).",
    hints: [
      "Three slices, and every single resident falls into exactly one of them.",
      "Utah's first slice is the largest anywhere; Maine's and Florida's last slice is the largest.",
    ],
    data: US_AGE_STRUCTURE,
    categories: [
      { key: "young", label: "Under 18", color: "#38bdf8" },
      { key: "adult", label: "18 to 64", color: "#1e3a8a" },
      { key: "old", label: "65 and over", color: "#f59e0b" },
    ],
    fmt: round0,
  },
  {
    id: "us-education",
    scope: "us",
    form: "composition",
    title: "Educational Attainment of Adults",
    aliases: ["educational attainment", "education levels", "how educated the population is", "college degrees", "share with a degree", "education breakdown", "schooling levels"],
    description:
      "Share of adults 25 and over at three levels — high school or less, some college or an associate degree, and a bachelor's degree or more — around 2022. The District of Columbia and Massachusetts have the largest share at the top level; West Virginia and Mississippi the smallest. Each pie is rounded to sum to 100. Boundaries: us-atlas (public domain).",
    hints: [
      "Everyone counted is at least 25, and the three slices are ordered rungs of the same ladder.",
      "The District of Columbia's top slice is more than double West Virginia's.",
    ],
    data: US_EDUCATION,
    categories: [
      { key: "hs", label: "High school or less", color: "#fcd34d" },
      { key: "some", label: "Some college", color: "#0891b2" },
      { key: "ba", label: "Bachelor's or more", color: "#4c1d95" },
    ],
    fmt: round0,
  },

  // --- Surface: interpolated field from point observations ------------------
  {
    id: "us-rainfall",
    scope: "us",
    form: "surface",
    title: "Average Annual Precipitation",
    aliases: ["rainfall", "precipitation", "annual rainfall", "how much rain falls", "average precipitation", "yearly rainfall", "how wet it is"],
    description:
      "Mean yearly total in inches, interpolated across the lower 48 from 64 station observations, then banded into zones. The Gulf coast exceeds 60 inches; the desert Southwest is under 10. Alaska and Hawaii are unshaded because the surface is built in projected space, where their insets sit beside California. Boundaries: us-atlas (public domain).",
    hints: [
      "A sharp edge runs roughly down the hundredth meridian, with everything to its west far below everything to its east.",
      "Mobile and New Orleans anchor the highest zone; Las Vegas and Phoenix the lowest.",
    ],
    data: null,
    stations: US_RAINFALL_STATIONS,
    interpolator: chromatic.interpolateYlGnBu,
    bandCount: 9,
    fmt: round0,
  },
  {
    id: "us-sunshine",
    scope: "us",
    form: "surface",
    title: "Average Annual Sunshine Hours",
    aliases: ["sunshine", "sunshine hours", "how sunny it is", "hours of sun", "annual sunshine", "sunniest places", "amount of sun"],
    description:
      "Mean yearly total in hours, interpolated across the lower 48 from 64 station observations and banded into zones. Phoenix and Las Vegas exceed 3,800 hours; Buffalo, Pittsburgh and Burlington fall near 2,000. Alaska and Hawaii are unshaded for the same projection reason as the precipitation map. Boundaries: us-atlas (public domain).",
    hints: [
      "The desert Southwest is the brightest zone and the eastern Great Lakes the dullest, with roughly a two-to-one spread between them.",
      "Phoenix and Las Vegas are highest; Buffalo and Pittsburgh are lowest.",
    ],
    data: null,
    stations: US_SUNSHINE_STATIONS,
    interpolator: chromatic.interpolateYlOrRd,
    bandCount: 9,
    fmt: round0,
  },
];

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

const NO_DATA = "#e2e8f0";
const BORDER = "#ffffff";
const BG = "#f8fafc";
const TITLE_COLOR = "#0f172a";
const TICK_COLOR = "#334155";
const FONT = "DejaVu Sans, Liberation Sans, sans-serif";

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildScale(spec) {
  const values = Object.values(spec.data);
  let min = Math.min(...values);
  let max = Math.max(...values);
  const factory = spec.scaleType === "sqrt" ? scaleSequentialSqrt : scaleSequential;
  const interp = spec.reverse
    ? (t) => spec.interpolator(1 - t)
    : spec.interpolator;
  // Sequential scale mapping value domain -> color via the interpolator.
  const scale = factory(interp).domain([min, max]);
  return { scale, min, max };
}

function legendSvg(spec, scale, min, max, x0, y, barW, barH) {
  const stops = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const value = min + t * (max - min);
    stops.push(`<stop offset="${(t * 100).toFixed(1)}%" stop-color="${scale(value)}" />`);
  }
  const gradId = `grad-${spec.id}`;
  const tickY = y + barH + 20;
  const mid = (min + max) / 2;
  return `
    <defs><linearGradient id="${gradId}" x1="0%" y1="0%" x2="100%" y2="0%">${stops.join("")}</linearGradient></defs>
    <rect x="${x0}" y="${y}" width="${barW}" height="${barH}" fill="url(#${gradId})" stroke="#cbd5e1" stroke-width="1" rx="3" />
    <text x="${x0}" y="${tickY}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="start">${esc(spec.fmt(min))}</text>
    <text x="${x0 + barW / 2}" y="${tickY}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(mid))}</text>
    <text x="${x0 + barW}" y="${tickY}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="end">${esc(spec.fmt(max))}</text>`;
}

// --- Canvas geometry ------------------------------------------------------
// The US atlas file is pre-projected into a 975 x 610 planar frame; the world
// file is projected here. Both projections are built once at module scope so
// that point, symbol and flow overlays land on exactly the same pixel grid as
// the polygons underneath them.

const US_W = 975;
const US_H = 744;
const US_MAP_Y = 74;
const WORLD_W = 980;
const WORLD_H = 620;
/** Extra canvas height for the forms that need a redactable label strip. */
const LABEL_LEGEND_EXTRA = 46;

// Documented by us-atlas for states-albers-10m.json.
const usProjection = geoAlbersUsa().scale(1300).translate([487.5, 305]);
const usPath = geoPath();
const worldCollection = { type: "FeatureCollection", features: worldCountries };
const worldProjection = geoNaturalEarth1().fitExtent(
  [[12, 70], [WORLD_W - 12, 540]],
  worldCollection,
);
const worldPath = geoPath(worldProjection);
const worldDrawable = worldCountries.filter(
  (f) => f.properties.name !== "Antarctica",
);

const BASE_LAND = "#e4eaf0";
const BASE_BORDER = "#ffffff";

function renderUs(spec) {
  const W = 975;
  const H = 744;
  const MAP_Y = 74;
  const { scale, min, max } = buildScale(spec);
  const path = geoPath(); // us-atlas albers file is pre-projected (planar coords)

  const paths = usStates
    .map((f) => {
      const v = spec.data[f.properties.name];
      const fill = v == null ? NO_DATA : scale(v);
      return `<path d="${path(f)}" fill="${fill}" stroke="${BORDER}" stroke-width="0.75" />`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}" />
    <text x="${W / 2}" y="46" font-family="${FONT}" font-size="30" font-weight="bold" fill="${TITLE_COLOR}" text-anchor="middle">${esc(spec.title)}</text>
    <g transform="translate(0, ${MAP_Y})">${paths}</g>
    ${legendSvg(spec, scale, min, max, (W - 440) / 2, 698, 440, 18)}
  </svg>`;

  return { svg, W, H, titleBand: { x: 0, y: 0, width: W, height: 68 } };
}

function renderWorld(spec) {
  const W = 980;
  const H = 620;
  const { scale, min, max } = buildScale(spec);
  const collection = { type: "FeatureCollection", features: worldCountries };
  const projection = geoNaturalEarth1().fitExtent(
    [[12, 70], [W - 12, 540]],
    collection,
  );
  const path = geoPath(projection);

  const paths = worldCountries
    .filter((f) => f.properties.name !== "Antarctica")
    .map((f) => {
      const v = spec.data[f.properties.name];
      const fill = v == null ? NO_DATA : scale(v);
      return `<path d="${path(f)}" fill="${fill}" stroke="${BORDER}" stroke-width="0.4" />`;
    })
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect width="${W}" height="${H}" fill="${BG}" />
    <text x="${W / 2}" y="40" font-family="${FONT}" font-size="28" font-weight="bold" fill="${TITLE_COLOR}" text-anchor="middle">${esc(spec.title)}</text>
    <g>${paths}</g>
    ${legendSvg(spec, scale, min, max, (W - 440) / 2, 566, 440, 18)}
  </svg>`;

  return { svg, W, H, titleBand: { x: 0, y: 0, width: W, height: 58 } };
}

// ---------------------------------------------------------------------------
// Shared pieces for the non-choropleth forms
// ---------------------------------------------------------------------------

/** Scope-specific canvas, base map and projection helpers. */
function scopeKit(scope) {
  if (scope === "us") {
    return {
      W: US_W,
      H: US_H,
      titleY: 46,
      titleSize: 30,
      titleBandHeight: 68,
      mapDy: US_MAP_Y,
      features: usStates,
      path: usPath,
      project: (lat, lon) => usProjection([lon, lat]),
      strokeWidth: 0.75,
      legendY: 698,
    };
  }
  return {
    W: WORLD_W,
    H: WORLD_H,
    titleY: 40,
    titleSize: 28,
    titleBandHeight: 58,
    mapDy: 0,
    features: worldDrawable,
    path: worldPath,
    project: (lat, lon) => worldProjection([lon, lat]),
    strokeWidth: 0.4,
    legendY: 566,
  };
}

function basePathsSvg(kit, fill = BASE_LAND) {
  return kit.features
    .map(
      (f) =>
        `<path d="${kit.path(f)}" fill="${fill}" stroke="${BASE_BORDER}" stroke-width="${kit.strokeWidth}" />`,
    )
    .join("");
}

function frameSvg(kit, H, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${kit.W}" height="${H}" viewBox="0 0 ${kit.W} ${H}">
    <rect width="${kit.W}" height="${H}" fill="${BG}" />
    <text x="${kit.W / 2}" y="${kit.titleY}" font-family="${FONT}" font-size="${kit.titleSize}" font-weight="bold" fill="${TITLE_COLOR}" text-anchor="middle">${esc(kit.title)}</text>
    ${body}
  </svg>`;
}

function titleRegion(kit) {
  return { kind: "title", x: 0, y: 0, width: kit.W, height: kit.titleBandHeight };
}

/** Deterministic PRNG so regenerating the maps never churns the PNGs. */
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Flatten a (Multi)Polygon into a list of planar rings. */
function ringsOf(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flat();
  return [];
}

/** Even-odd ray cast across every ring, which handles holes and islands. */
function pointInRings(x, y, rings) {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const xi = ring[i][0];
      const yi = ring[i][1];
      const xj = ring[j][0];
      const yj = ring[j][1];
      if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
  }
  return inside;
}

function parseColor(color) {
  if (color.startsWith("#")) {
    const hex = color.length === 4
      ? color
          .slice(1)
          .split("")
          .map((c) => c + c)
          .join("")
      : color.slice(1);
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }
  const m = color.match(/(\d+(?:\.\d+)?)/g);
  return m ? m.slice(0, 3).map(Number) : [0, 0, 0];
}

function readableTextColor(fill) {
  const [r, g, b] = parseColor(fill);
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? "#1e293b" : "#ffffff";
}

// --- Legends --------------------------------------------------------------

/**
 * Discrete swatch legend. Swatches stay visible (they tell the player this is
 * a categorical map with N classes); the WORDS sit in their own band well
 * below, which is returned as a second redaction region so the redactor can
 * cover them without touching the swatches.
 */
function categoryLegend(kit, spec, swatchY) {
  const cats = spec.categories;
  const cellW = Math.min(230, (kit.W - 40) / cats.length);
  const totalW = cellW * cats.length;
  const x0 = (kit.W - totalW) / 2;
  const swatchW = Math.min(96, cellW - 24);
  const swatchH = 18;
  const labelBaseline = swatchY + swatchH + 50;
  const parts = [];
  cats.forEach((c, i) => {
    const cx = x0 + cellW * i + cellW / 2;
    parts.push(
      `<rect x="${(cx - swatchW / 2).toFixed(1)}" y="${swatchY}" width="${swatchW.toFixed(1)}" height="${swatchH}" fill="${c.color}" stroke="#94a3b8" stroke-width="1" rx="3" />`,
    );
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${labelBaseline}" font-family="${FONT}" font-size="14" fill="${TICK_COLOR}" text-anchor="middle">${esc(c.label)}</text>`,
    );
  });
  return {
    svg: parts.join(""),
    labelRegion: {
      kind: "legend",
      x: 0,
      y: labelBaseline - 15,
      width: kit.W,
      height: 20,
    },
  };
}

/** Nested-free, side-by-side proportional circles with bare numeric labels. */
function symbolLegend(kit, spec, radiusFor, values, baselineY) {
  const radii = values.map(radiusFor);
  const gap = 30;
  const totalW = radii.reduce((s, r) => s + 2 * r, 0) + gap * (radii.length - 1);
  let x = (kit.W - totalW) / 2;
  const parts = [];
  values.forEach((v, i) => {
    const r = radii[i];
    const cx = x + r;
    parts.push(
      `<circle cx="${cx.toFixed(1)}" cy="${(baselineY - r).toFixed(1)}" r="${r.toFixed(1)}" fill="${spec.symbolColor}" fill-opacity="0.55" stroke="${spec.symbolColor}" stroke-width="1.2" />`,
    );
    parts.push(
      `<text x="${cx.toFixed(1)}" y="${baselineY + 22}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(v))}</text>`,
    );
    x += 2 * r + gap;
  });
  return parts.join("");
}

function dotLegend(kit, spec, y) {
  const label = spec.fmt(spec.dotUnit);
  const cx = kit.W / 2 - 42;
  return `<circle cx="${cx}" cy="${y}" r="2.4" fill="${spec.dotColor}" />
    <text x="${cx + 16}" y="${y + 6}" font-family="${FONT}" font-size="17" fill="${TICK_COLOR}" text-anchor="start">= ${esc(label)}</text>`;
}

function flowLegend(kit, spec, widthFor, values, y) {
  const parts = [];
  const seg = 74;
  const gap = 34;
  const totalW = values.length * seg + (values.length - 1) * gap;
  let x = (kit.W - totalW) / 2;
  for (const v of values) {
    parts.push(
      `<line x1="${x.toFixed(1)}" y1="${y}" x2="${(x + seg).toFixed(1)}" y2="${y}" stroke="${spec.flowColor}" stroke-opacity="0.7" stroke-width="${widthFor(v).toFixed(2)}" stroke-linecap="round" />`,
    );
    parts.push(
      `<text x="${(x + seg / 2).toFixed(1)}" y="${y + 26}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(v))}</text>`,
    );
    x += seg + gap;
  }
  return parts.join("");
}

function pointLegend(kit, spec, count, y) {
  const cx = kit.W / 2 - 30;
  const r = spec.pointRadius ?? 5;
  return `<circle cx="${cx}" cy="${y}" r="${r}" fill="${spec.pointColor}" stroke="#ffffff" stroke-width="1.6" />
    <text x="${cx + r + 14}" y="${y + 6}" font-family="${FONT}" font-size="17" fill="${TICK_COLOR}" text-anchor="start">x ${count}</text>`;
}

// Classic three-by-three bivariate matrix (Stevens' GnBu scheme).
const BIVARIATE_MATRIX = [
  ["#e8e8e8", "#b8d6be", "#73ae80"],
  ["#b5c0da", "#90b2b3", "#5a9178"],
  ["#6c83b5", "#567994", "#2a5a5b"],
];

function bivariateLegend(kit, x0, y0) {
  const cell = 26;
  const parts = [];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      // row 0 drawn at the bottom so "up" means a higher second variable.
      const y = y0 + (2 - row) * cell;
      parts.push(
        `<rect x="${x0 + col * cell}" y="${y}" width="${cell}" height="${cell}" fill="${BIVARIATE_MATRIX[row][col]}" stroke="#ffffff" stroke-width="1" />`,
      );
    }
  }
  const gridW = 3 * cell;
  const gridH = 3 * cell;
  parts.push(
    `<line x1="${x0}" y1="${y0 + gridH + 12}" x2="${x0 + gridW}" y2="${y0 + gridH + 12}" stroke="${TICK_COLOR}" stroke-width="1.6" marker-end="url(#bivArrow)" />`,
  );
  parts.push(
    `<line x1="${x0 - 12}" y1="${y0 + gridH}" x2="${x0 - 12}" y2="${y0}" stroke="${TICK_COLOR}" stroke-width="1.6" marker-end="url(#bivArrow)" />`,
  );
  const defs = `<defs><marker id="bivArrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${TICK_COLOR}" /></marker></defs>`;
  return defs + parts.join("");
}

// --- Form renderers -------------------------------------------------------

/**
 * Proportional (graduated) symbols. `spec.data` puts one circle at each
 * feature's centroid; `spec.places` puts one circle at each listed coordinate.
 */
function renderSymbol(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const rMax = spec.maxRadius ?? 30;

  let items;
  if (spec.places) {
    items = spec.places
      .map((p) => {
        const xy = kit.project(p.lat, p.lon);
        return xy ? { x: xy[0], y: xy[1], value: p.value } : null;
      })
      .filter(Boolean);
  } else {
    items = kit.features
      .map((f) => {
        const v = spec.data[f.properties.name];
        if (v == null) return null;
        const nudge = US_SYMBOL_NUDGE[f.properties.name];
        const c = kit.path.centroid(f);
        if (!Number.isFinite(c[0])) return null;
        return {
          x: c[0] + (nudge ? nudge[0] : 0),
          y: c[1] + (nudge ? nudge[1] : 0),
          value: v,
        };
      })
      .filter(Boolean);
  }

  const vmax = Math.max(...items.map((i) => i.value));
  const radiusFor = (v) => rMax * Math.sqrt(Math.max(v, 0) / vmax);

  const circles = items
    .slice()
    .sort((a, b) => b.value - a.value)
    .map(
      (i) =>
        `<circle cx="${i.x.toFixed(1)}" cy="${i.y.toFixed(1)}" r="${radiusFor(i.value).toFixed(2)}" fill="${spec.symbolColor}" fill-opacity="0.5" stroke="${spec.symbolColor}" stroke-width="1.2" />`,
    )
    .join("");

  const legendValues = [vmax, vmax * 0.35, vmax * 0.1].map((v) =>
    vmax >= 40 ? Math.round(v) : Math.round(v * 10) / 10,
  );
  const H = kit.H + 40;
  const baselineY = kit.legendY + 46;
  const body = `<g transform="translate(0, ${kit.mapDy})">${basePathsSvg(kit)}${circles}</g>
    ${symbolLegend(kit, spec, radiusFor, legendValues, baselineY)}`;

  return {
    svg: frameSvg(kit, H, body),
    W: kit.W,
    H,
    regions: [titleRegion(kit)],
  };
}

/** Dot density: N seeded dots rejection-sampled inside each polygon. */
function renderDot(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const dots = [];

  for (const f of kit.features) {
    const v = spec.data[f.properties.name];
    if (v == null) continue;
    const n = Math.round(v / spec.dotUnit);
    if (n <= 0) continue;
    const rings = ringsOf(f.geometry);
    if (!rings.length) continue;
    const [[x0, y0], [x1, y1]] = kit.path.bounds(f);
    const rand = mulberry32(hashSeed(`${spec.id}:${f.properties.name}`));
    let placed = 0;
    let tries = 0;
    const maxTries = n * 600 + 3000;
    while (placed < n && tries < maxTries) {
      tries++;
      const x = x0 + rand() * (x1 - x0);
      const y = y0 + rand() * (y1 - y0);
      if (pointInRings(x, y, rings)) {
        dots.push(`${x.toFixed(1)},${y.toFixed(1)}`);
        placed++;
      }
    }
  }

  const dotSvg = dots
    .map((d) => {
      const [x, y] = d.split(",");
      return `<circle cx="${x}" cy="${y}" r="1.7" />`;
    })
    .join("");

  const body = `<g transform="translate(0, ${kit.mapDy})">
      ${basePathsSvg(kit, "#f1f5f9")}
      <g fill="${spec.dotColor}" fill-opacity="0.75">${dotSvg}</g>
      <g fill="none" stroke="#94a3b8" stroke-width="0.7">${kit.features.map((f) => `<path d="${kit.path(f)}" />`).join("")}</g>
    </g>
    ${dotLegend(kit, spec, kit.legendY + 8)}`;

  return {
    svg: frameSvg(kit, kit.H, body),
    W: kit.W,
    H: kit.H,
    regions: [titleRegion(kit)],
  };
}

/** Qualitative / binary map: fill by class, discrete swatch legend. */
function renderCategorical(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const H = kit.H + LABEL_LEGEND_EXTRA;
  const colorOf = Object.fromEntries(spec.categories.map((c) => [c.key, c.color]));

  const paths = kit.features
    .map((f) => {
      const key = spec.data[f.properties.name];
      const fill = key == null ? NO_DATA : (colorOf[key] ?? NO_DATA);
      return `<path d="${kit.path(f)}" fill="${fill}" stroke="${BORDER}" stroke-width="${kit.strokeWidth}" />`;
    })
    .join("");

  const legend = categoryLegend(kit, spec, kit.legendY - 8);
  const body = `<g transform="translate(0, ${kit.mapDy})">${paths}</g>${legend.svg}`;

  return {
    svg: frameSvg(kit, H, body),
    W: kit.W,
    H,
    regions: [titleRegion(kit), legend.labelRegion],
  };
}

/** Scattered located points, no polygon shading at all. */
function renderPoints(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const r = spec.pointRadius ?? 5;
  const pts = spec.places
    .map((p) => kit.project(p.lat, p.lon))
    .filter((xy) => xy && Number.isFinite(xy[0]));

  const markers = pts
    .map(
      (xy) =>
        `<circle cx="${xy[0].toFixed(1)}" cy="${xy[1].toFixed(1)}" r="${r}" fill="${spec.pointColor}" fill-opacity="0.9" stroke="#ffffff" stroke-width="1.6" />`,
    )
    .join("");

  const body = `<g transform="translate(0, ${kit.mapDy})">${basePathsSvg(kit, "#eef2f7")}${markers}</g>
    ${pointLegend(kit, spec, pts.length, kit.legendY + 12)}`;

  return {
    svg: frameSvg(kit, kit.H, body),
    W: kit.W,
    H: kit.H,
    regions: [titleRegion(kit)],
  };
}

/** Origin-destination arcs, width-scaled. */
function renderFlow(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const vmax = Math.max(...spec.flows.map((f) => f.value));
  const wMax = spec.maxWidth ?? 9;
  const widthFor = (v) => Math.max(0.8, wMax * Math.sqrt(v / vmax));

  const arcs = [];
  const nodes = new Map();
  for (const flow of spec.flows) {
    const a = kit.project(flow.from[0], flow.from[1]);
    const b = kit.project(flow.to[0], flow.to[1]);
    if (!a || !b) continue;
    nodes.set(`${a[0].toFixed(1)},${a[1].toFixed(1)}`, a);
    nodes.set(`${b[0].toFixed(1)},${b[1].toFixed(1)}`, b);
    // Bow the arc perpendicular to the chord so parallel routes stay legible.
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy) || 1;
    const cx = mx - dy * 0.13;
    const cy = my + dx * 0.13;
    arcs.push(
      `<path d="M ${a[0].toFixed(1)} ${a[1].toFixed(1)} Q ${cx.toFixed(1)} ${cy.toFixed(1)} ${b[0].toFixed(1)} ${b[1].toFixed(1)}" fill="none" stroke="${spec.flowColor}" stroke-opacity="0.55" stroke-width="${widthFor(flow.value).toFixed(2)}" stroke-linecap="round" />`,
    );
  }
  const nodeSvg = [...nodes.values()]
    .map(
      (p) =>
        `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="3.2" fill="#0f172a" />`,
    )
    .join("");

  const legendValues = [vmax, vmax * 0.6, vmax * 0.33].map(
    (v) => Math.round(v * 10) / 10,
  );
  const body = `<g transform="translate(0, ${kit.mapDy})">${basePathsSvg(kit, "#eef2f7")}${arcs.join("")}${nodeSvg}</g>
    ${flowLegend(kit, spec, widthFor, legendValues, kit.legendY + 6)}`;

  return {
    svg: frameSvg(kit, kit.H, body),
    W: kit.W,
    H: kit.H,
    regions: [titleRegion(kit)],
  };
}

function tercileBreaks(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return [at(1 / 3), at(2 / 3)];
}

function classOf(v, breaks) {
  return v <= breaks[0] ? 0 : v <= breaks[1] ? 1 : 2;
}

/** Bivariate choropleth over two variables with a three-by-three key. */
function renderBivariate(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const names = kit.features
    .map((f) => f.properties.name)
    .filter((n) => spec.dataX[n] != null && spec.dataY[n] != null);
  const bx = tercileBreaks(names.map((n) => spec.dataX[n]));
  const by = tercileBreaks(names.map((n) => spec.dataY[n]));

  const paths = kit.features
    .map((f) => {
      const n = f.properties.name;
      const x = spec.dataX[n];
      const y = spec.dataY[n];
      const fill =
        x == null || y == null
          ? NO_DATA
          : BIVARIATE_MATRIX[classOf(y, by)][classOf(x, bx)];
      return `<path d="${kit.path(f)}" fill="${fill}" stroke="${BORDER}" stroke-width="${kit.strokeWidth}" />`;
    })
    .join("");

  const H = kit.H + 60;
  const body = `<g transform="translate(0, ${kit.mapDy})">${paths}</g>
    ${bivariateLegend(kit, kit.W / 2 - 39, kit.legendY + 2)}`;

  return {
    svg: frameSvg(kit, H, body),
    W: kit.W,
    H,
    regions: [titleRegion(kit)],
  };
}

// --- Tile-grid cartogram (US only) ----------------------------------------

const TILE_SIZE = 62;
const TILE_PITCH = 70;
const TILE_COLS = 12;
const TILE_ROWS = 8;
const TILE_X0 = (US_W - (TILE_COLS * TILE_PITCH - (TILE_PITCH - TILE_SIZE))) / 2;
const TILE_Y0 = 108;

function renderTileGrid(spec) {
  const kit = scopeKit("us");
  kit.title = spec.title;
  const categorical = Boolean(spec.categories);
  const H = categorical ? kit.H + LABEL_LEGEND_EXTRA : kit.H;

  let fillFor;
  let scale;
  let min;
  let max;
  if (categorical) {
    const colorOf = Object.fromEntries(spec.categories.map((c) => [c.key, c.color]));
    fillFor = (v) => (v == null ? NO_DATA : (colorOf[v] ?? NO_DATA));
  } else {
    ({ scale, min, max } = buildScale(spec));
    fillFor = (v) => (v == null ? NO_DATA : scale(v));
  }

  const tiles = [];
  for (const f of usStates) {
    const name = f.properties.name;
    const abbr = US_ABBR[name];
    const cell = US_TILE_GRID[abbr];
    if (!cell) continue;
    const [row, col] = cell;
    const x = TILE_X0 + col * TILE_PITCH;
    const y = TILE_Y0 + row * TILE_PITCH;
    const fill = fillFor(spec.data[name]);
    tiles.push(
      `<rect x="${x.toFixed(1)}" y="${y}" width="${TILE_SIZE}" height="${TILE_SIZE}" rx="6" fill="${fill}" stroke="#ffffff" stroke-width="2" />` +
        `<text x="${(x + TILE_SIZE / 2).toFixed(1)}" y="${y + TILE_SIZE / 2 + 7}" font-family="${FONT}" font-size="20" font-weight="bold" fill="${readableTextColor(fill)}" text-anchor="middle">${abbr}</text>`,
    );
  }

  let legendSvgStr;
  const regions = [titleRegion(kit)];
  if (categorical) {
    const legend = categoryLegend(kit, spec, kit.legendY - 8);
    legendSvgStr = legend.svg;
    regions.push(legend.labelRegion);
  } else {
    legendSvgStr = legendSvg(spec, scale, min, max, (kit.W - 440) / 2, kit.legendY - 8, 440, 18);
  }

  return {
    svg: frameSvg(kit, H, `<g>${tiles.join("")}</g>${legendSvgStr}`),
    W: kit.W,
    H,
    regions,
  };
}

// Small pixel nudges for centroids that fall in open water or collide with a
// neighbour on the graduated-symbol maps.
const US_SYMBOL_NUDGE = {
  Michigan: [18, 26],
  "District of Columbia": [12, 14],
  Maryland: [-12, -8],
  Hawaii: [0, -6],
  Louisiana: [-6, -10],
  Florida: [14, -18],
  Virginia: [12, 0],
};

// ---------------------------------------------------------------------------
// Second-wave forms
// ---------------------------------------------------------------------------

/**
 * Diverging choropleth. The point of the form is the midpoint: colour says
 * which side of zero (or of an average) a place falls on, and the legend puts
 * a tick there so the reader can see where the turn happens.
 *
 * The two halves are scaled INDEPENDENTLY — domain [min, mid, max] rather than
 * a symmetric span. A symmetric domain is the more honest encoding, because
 * equal distances from the midpoint then get equal colour weight, but these
 * datasets are lopsided: population change runs from -3 to +18, so under
 * symmetry the entire losing side compresses into the faintest tint and the
 * three states that actually shrank become invisible. That destroys the one
 * reading the form exists to give. The cost is that a tint on the short side
 * means a smaller absolute change than the same tint on the long side, which
 * is why the legend labels both ends.
 */
function renderDiverging(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const mid = spec.midpoint ?? 0;
  const values = Object.values(spec.data);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const scale = scaleDiverging(spec.interpolator).domain([min, mid, max]);

  const paths = kit.features
    .map((f) => {
      const v = spec.data[f.properties.name];
      const fill = v == null ? NO_DATA : scale(v);
      return `<path d="${kit.path(f)}" fill="${fill}" stroke="${BORDER}" stroke-width="${kit.strokeWidth}" />`;
    })
    .join("");

  const barW = 440;
  const barH = 18;
  const x0 = (kit.W - barW) / 2;
  const y = kit.legendY;
  const stops = [];
  for (let i = 0; i <= 16; i++) {
    const t = i / 16;
    stops.push(
      `<stop offset="${(t * 100).toFixed(1)}%" stop-color="${scale(min + t * (max - min))}" />`,
    );
  }
  // The tick sits where the midpoint actually falls along the bar, which with
  // independently-scaled halves is off-centre — and that offset is itself
  // information: it shows how lopsided the data is.
  const midX = x0 + barW * ((mid - min) / (max - min));
  const legend = `
    <defs><linearGradient id="grad-${spec.id}" x1="0%" y1="0%" x2="100%" y2="0%">${stops.join("")}</linearGradient></defs>
    <rect x="${x0}" y="${y}" width="${barW}" height="${barH}" fill="url(#grad-${spec.id})" stroke="#cbd5e1" stroke-width="1" rx="3" />
    <line x1="${midX}" y1="${y - 5}" x2="${midX}" y2="${y + barH + 5}" stroke="${TICK_COLOR}" stroke-width="2" />
    <text x="${x0}" y="${y + barH + 22}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="start">${esc(spec.fmt(min))}</text>
    <text x="${midX}" y="${y + barH + 22}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(mid))}</text>
    <text x="${x0 + barW}" y="${y + barH + 22}" font-family="${FONT}" font-size="15" fill="${TICK_COLOR}" text-anchor="end">${esc(spec.fmt(max))}</text>`;

  const body = `<g transform="translate(0, ${kit.mapDy})">${paths}</g>${legend}`;
  return {
    svg: frameSvg(kit, kit.H, body),
    W: kit.W,
    H: kit.H,
    regions: [titleRegion(kit)],
  };
}

/**
 * Classed choropleth: quantile bins rather than a continuous ramp, so every
 * class holds the same number of places and the legend is a row of steps with
 * the break values under them. Reads very differently from a smooth ramp — the
 * eye counts classes instead of judging shade.
 */
function renderClassed(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const n = spec.classCount ?? 5;
  const sorted = Object.values(spec.data).sort((a, b) => a - b);
  // Quantile breaks: n-1 interior cuts.
  const breaks = [];
  for (let i = 1; i < n; i++) {
    breaks.push(sorted[Math.floor((i * sorted.length) / n)]);
  }
  const colors = [];
  for (let i = 0; i < n; i++) {
    const t = 0.15 + (0.85 - 0.15) * (i / (n - 1));
    colors.push(spec.interpolator(spec.reverse ? 1 - t : t));
  }
  const classOfValue = (v) => {
    for (let i = 0; i < breaks.length; i++) if (v < breaks[i]) return i;
    return n - 1;
  };

  const paths = kit.features
    .map((f) => {
      const v = spec.data[f.properties.name];
      const fill = v == null ? NO_DATA : colors[classOfValue(v)];
      return `<path d="${kit.path(f)}" fill="${fill}" stroke="${BORDER}" stroke-width="${kit.strokeWidth}" />`;
    })
    .join("");

  const swW = 76;
  const swH = 18;
  const totalW = swW * n;
  const x0 = (kit.W - totalW) / 2;
  const y = kit.legendY;
  const parts = [];
  for (let i = 0; i < n; i++) {
    parts.push(
      `<rect x="${x0 + i * swW}" y="${y}" width="${swW}" height="${swH}" fill="${colors[i]}" stroke="#cbd5e1" stroke-width="1" />`,
    );
  }
  // Break values sit on the boundaries between swatches, which is where they
  // actually apply; labelling swatch centres would imply each class is a
  // single value.
  breaks.forEach((b, i) => {
    parts.push(
      `<text x="${x0 + (i + 1) * swW}" y="${y + swH + 22}" font-family="${FONT}" font-size="14" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(b))}</text>`,
    );
  });

  const body = `<g transform="translate(0, ${kit.mapDy})">${paths}</g>${parts.join("")}`;
  return {
    svg: frameSvg(kit, kit.H, body),
    W: kit.W,
    H: kit.H,
    regions: [titleRegion(kit)],
  };
}

/**
 * Non-contiguous cartogram: every place keeps its own outline and its position,
 * but shrinks toward its centroid by the square root of its value, so drawn
 * AREA is proportional to the number. The faint untouched map underneath is
 * what makes it readable — the gap between a shape and its own outline is the
 * quantity.
 */
function renderCartogram(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const vmax = Math.max(...Object.values(spec.data));

  const shapes = kit.features
    .map((f) => {
      const v = spec.data[f.properties.name];
      if (v == null || v <= 0) return "";
      const c = kit.path.centroid(f);
      if (!Number.isFinite(c[0])) return "";
      const k = Math.sqrt(v / vmax);
      return `<g transform="translate(${c[0].toFixed(1)},${c[1].toFixed(1)}) scale(${k.toFixed(4)}) translate(${(-c[0]).toFixed(1)},${(-c[1]).toFixed(1)})"><path d="${kit.path(f)}" fill="${spec.symbolColor}" fill-opacity="0.85" stroke="#ffffff" stroke-width="${(kit.strokeWidth / k).toFixed(2)}" /></g>`;
    })
    .join("");

  // Legend: three squares whose areas stand in the same ratio as the values.
  const legendVals = [vmax, vmax * 0.25, vmax * 0.05];
  const side = (v) => 46 * Math.sqrt(v / vmax);
  const gap = 34;
  const totalW = legendVals.reduce((s, v) => s + side(v), 0) + gap * 2;
  let lx = (kit.W - totalW) / 2;
  const baseline = kit.legendY + 34;
  const legendParts = [];
  for (const v of legendVals) {
    const s = side(v);
    legendParts.push(
      `<rect x="${lx.toFixed(1)}" y="${(baseline - s).toFixed(1)}" width="${s.toFixed(1)}" height="${s.toFixed(1)}" fill="${spec.symbolColor}" fill-opacity="0.85" stroke="#ffffff" stroke-width="1" />`,
      `<text x="${(lx + s / 2).toFixed(1)}" y="${baseline + 22}" font-family="${FONT}" font-size="14" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(v))}</text>`,
    );
    lx += s + gap;
  }

  const H = kit.H + 30;
  const body = `<g transform="translate(0, ${kit.mapDy})">${basePathsSvg(kit, "#eef2f6")}${shapes}</g>${legendParts.join("")}`;
  return { svg: frameSvg(kit, H, body), W: kit.W, H, regions: [titleRegion(kit)] };
}

/**
 * Dorling cartogram: one circle per place, area-scaled by value, then nudged
 * apart until none overlap. Geography survives as arrangement rather than as
 * shape, which is the whole point — crowded small places stop disappearing.
 */
function renderDorling(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const rMax = spec.maxRadius ?? 30;
  const vmax = Math.max(...Object.values(spec.data));

  const nodes = [];
  for (const f of kit.features) {
    const v = spec.data[f.properties.name];
    if (v == null || v <= 0) continue;
    const c = kit.path.centroid(f);
    if (!Number.isFinite(c[0])) continue;
    nodes.push({ x: c[0], y: c[1], r: rMax * Math.sqrt(v / vmax), value: v });
  }

  // Deterministic relaxation: fixed iteration count, no randomness, so the
  // committed PNG is stable across runs.
  for (let iter = 0; iter < 220; iter++) {
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i];
        const b = nodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let d = Math.hypot(dx, dy);
        const need = a.r + b.r + 1.2;
        if (d === 0) {
          dx = (i % 2 ? 1 : -1) * 0.5;
          dy = 0.5;
          d = Math.hypot(dx, dy);
        }
        if (d < need) {
          const push = (need - d) / 2 / d;
          const ux = dx * push;
          const uy = dy * push;
          a.x -= ux;
          a.y -= uy;
          b.x += ux;
          b.y += uy;
        }
      }
    }
  }

  const circles = nodes
    .slice()
    .sort((a, b) => b.r - a.r)
    .map(
      (n) =>
        `<circle cx="${n.x.toFixed(1)}" cy="${n.y.toFixed(1)}" r="${n.r.toFixed(2)}" fill="${spec.symbolColor}" fill-opacity="0.78" stroke="#ffffff" stroke-width="1.1" />`,
    )
    .join("");

  const radiusFor = (v) => rMax * Math.sqrt(Math.max(v, 0) / vmax);
  const legendValues = [vmax, vmax * 0.3, vmax * 0.08].map((v) =>
    vmax >= 40 ? Math.round(v) : Math.round(v * 10) / 10,
  );
  const H = kit.H + 40;
  const body = `<g transform="translate(0, ${kit.mapDy})">${basePathsSvg(kit, "#eef2f6")}${circles}</g>
    ${symbolLegend(kit, spec, radiusFor, legendValues, kit.legendY + 46)}`;
  return { svg: frameSvg(kit, H, body), W: kit.W, H, regions: [titleRegion(kit)] };
}

/**
 * Spike map: a vertical needle at each centroid, height proportional to value.
 * Height is a linear channel rather than an area one, so a single dominant
 * place towers instead of merely widening — which is exactly the reading this
 * form is for.
 */
function renderSpike(spec) {
  const kit = scopeKit(spec.scope);
  kit.title = spec.title;
  const maxH = spec.maxSpike ?? 120;
  const halfW = spec.spikeWidth ?? 4;
  const vmax = Math.max(...Object.values(spec.data));

  const spikes = kit.features
    .map((f) => {
      const v = spec.data[f.properties.name];
      if (v == null || v <= 0) return null;
      const nudge = US_SYMBOL_NUDGE[f.properties.name];
      const c = kit.path.centroid(f);
      if (!Number.isFinite(c[0])) return null;
      const x = c[0] + (nudge ? nudge[0] : 0);
      const y = c[1] + (nudge ? nudge[1] : 0);
      return { x, y, h: maxH * (v / vmax) };
    })
    .filter(Boolean)
    // Draw back-to-front so a tall southern spike overlaps the one behind it
    // the way it would in a landscape, instead of being cut by it.
    .sort((a, b) => a.y - b.y)
    .map(
      (s) =>
        // A dot at the foot as well as the needle. Without it the tallest
        // spikes read as belonging to whatever they pass through — Hawaii's
        // rises out of its inset and straight across New Mexico.
        `<path d="M ${(s.x - halfW).toFixed(1)} ${s.y.toFixed(1)} L ${s.x.toFixed(1)} ${(s.y - s.h).toFixed(1)} L ${(s.x + halfW).toFixed(1)} ${s.y.toFixed(1)} Z" fill="${spec.symbolColor}" fill-opacity="0.72" stroke="${spec.symbolColor}" stroke-width="0.8" stroke-linejoin="round" />` +
        `<circle cx="${s.x.toFixed(1)}" cy="${s.y.toFixed(1)}" r="2.6" fill="${spec.symbolColor}" />`,
    )
    .join("");

  // The legend needles are drawn at the same scale as the map's, so the
  // canvas has to grow by a full spike height to hold them: at the shared
  // legend line they would rise back up through the southern states.
  const H = kit.H + maxH + 24;
  const legendVals = [vmax, vmax * 0.5];
  const gap = 96;
  let lx = kit.W / 2 - gap / 2;
  const baseline = H - 34;
  const legendParts = [];
  for (const v of legendVals) {
    const h = maxH * (v / vmax);
    legendParts.push(
      `<path d="M ${lx - halfW} ${baseline} L ${lx} ${(baseline - h).toFixed(1)} L ${lx + halfW} ${baseline} Z" fill="${spec.symbolColor}" fill-opacity="0.72" stroke="${spec.symbolColor}" stroke-width="0.8" />`,
      `<circle cx="${lx}" cy="${baseline}" r="2.6" fill="${spec.symbolColor}" />`,
      `<text x="${lx}" y="${baseline + 20}" font-family="${FONT}" font-size="14" fill="${TICK_COLOR}" text-anchor="middle">${esc(spec.fmt(v))}</text>`,
    );
    lx += gap;
  }

  const body = `<g transform="translate(0, ${kit.mapDy})">${basePathsSvg(kit)}${spikes}</g>${legendParts.join("")}`;
  return { svg: frameSvg(kit, H, body), W: kit.W, H, regions: [titleRegion(kit)] };
}

/**
 * Composition map: a pie per state showing how a whole splits three ways.
 * Laid out on the tile grid rather than at centroids, because fifty-one pies
 * at true positions collide into porridge across the Northeast, and a pie you
 * cannot read encodes nothing. Class names live in the legend, so this form
 * emits the second (label-strip) redaction region.
 */
function renderComposition(spec) {
  const kit = scopeKit("us");
  kit.title = spec.title;
  const R = spec.pieRadius ?? 24;
  const parts = [];

  for (const f of usStates) {
    const name = f.properties.name;
    const shares = spec.data[name];
    const cell = US_TILE_GRID[US_ABBR[name]];
    if (!shares || !cell) continue;
    const [row, col] = cell;
    const cx = TILE_X0 + col * TILE_PITCH + TILE_SIZE / 2;
    const cy = TILE_Y0 + row * TILE_PITCH + TILE_SIZE / 2;
    const total = shares.reduce((a, b) => a + b, 0);

    let angle = -Math.PI / 2; // start at twelve o'clock
    shares.forEach((share, i) => {
      const sweep = (share / total) * Math.PI * 2;
      const end = angle + sweep;
      const x1 = cx + R * Math.cos(angle);
      const y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(end);
      const y2 = cy + R * Math.sin(end);
      const large = sweep > Math.PI ? 1 : 0;
      parts.push(
        `<path d="M ${cx.toFixed(1)} ${cy.toFixed(1)} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${R} ${R} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${spec.categories[i].color}" stroke="#ffffff" stroke-width="1" />`,
      );
      angle = end;
    });

    parts.push(
      `<text x="${cx.toFixed(1)}" y="${(cy + R + 14).toFixed(1)}" font-family="${FONT}" font-size="12" font-weight="bold" fill="${TICK_COLOR}" text-anchor="middle">${US_ABBR[name]}</text>`,
    );
  }

  const legend = categoryLegend(kit, spec, kit.legendY - 4);
  const H = kit.H + LABEL_LEGEND_EXTRA;
  return {
    svg: frameSvg(kit, H, `<g>${parts.join("")}</g>${legend.svg}`),
    W: kit.W,
    H,
    regions: [titleRegion(kit), legend.labelRegion],
  };
}

/**
 * Interpolated surface: inverse-distance weighting from point observations
 * onto a grid, quantised into bands so the result reads as contour zones
 * rather than a smudge, and clipped to the land it describes.
 *
 * Interpolation runs in PROJECTED pixel space, which is why the caller must
 * pass contiguous-48 stations only: in an Albers USA frame the Alaska and
 * Hawaii insets sit beside California, so a pixel-space weighting would paint
 * them with mainland weather. Those two are left as plain base land.
 */
function renderSurface(spec) {
  const kit = scopeKit("us");
  kit.title = spec.title;
  const CELL = spec.cellSize ?? 9;
  const BANDS = spec.bandCount ?? 9;

  const pts = spec.stations
    .map((s) => {
      const xy = kit.project(s.lat, s.lon);
      return xy ? { x: xy[0], y: xy[1], v: s.value } : null;
    })
    .filter(Boolean);

  const values = pts.map((p) => p.v);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const interp = spec.reverse
    ? (t) => spec.interpolator(1 - t)
    : spec.interpolator;
  const bandColor = (b) => interp(0.08 + 0.86 * (b / (BANDS - 1)));

  const mainland = usStates.filter(
    (f) => f.properties.name !== "Alaska" && f.properties.name !== "Hawaii",
  );
  const clipD = mainland.map((f) => kit.path(f)).join(" ");

  // One rect per grid cell, coloured by its band. Adjacent cells sharing a
  // band merge visually into a zone, which is the contour reading without the
  // cost of tracing real isolines.
  const cells = [];
  const gridW = 975;
  const gridH = 620;
  for (let y = 0; y < gridH; y += CELL) {
    for (let x = 0; x < gridW; x += CELL) {
      const px = x + CELL / 2;
      const py = y + CELL / 2;
      let num = 0;
      let den = 0;
      let exact = null;
      for (const p of pts) {
        const d2 = (p.x - px) ** 2 + (p.y - py) ** 2;
        if (d2 < 1) {
          exact = p.v;
          break;
        }
        const w = 1 / (d2 * d2 === 0 ? 1 : d2 * Math.sqrt(d2));
        num += w * p.v;
        den += w;
      }
      const v = exact ?? num / den;
      const t = (v - min) / (max - min || 1);
      const band = Math.max(0, Math.min(BANDS - 1, Math.floor(t * BANDS)));
      cells.push(
        `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" fill="${bandColor(band)}" />`,
      );
    }
  }

  const bandScale = (v) => {
    const t = (v - min) / (max - min || 1);
    return bandColor(Math.max(0, Math.min(BANDS - 1, Math.floor(t * BANDS))));
  };
  const legend = legendSvg(spec, bandScale, min, max, (kit.W - 440) / 2, kit.legendY, 440, 18);

  const body = `<defs><clipPath id="land-${spec.id}"><path d="${clipD}" /></clipPath></defs>
    <g transform="translate(0, ${kit.mapDy})">
      ${basePathsSvg(kit, "#eef2f6")}
      <g clip-path="url(#land-${spec.id})">${cells.join("")}</g>
      ${mainland.map((f) => `<path d="${kit.path(f)}" fill="none" stroke="#ffffff" stroke-width="0.7" />`).join("")}
    </g>${legend}`;

  return {
    svg: frameSvg(kit, kit.H, body),
    W: kit.W,
    H: kit.H,
    regions: [titleRegion(kit)],
  };
}

// --- Dispatcher -----------------------------------------------------------

function renderSpec(spec) {
  const form = spec.form ?? "choropleth";
  switch (form) {
    case "choropleth": {
      const r = spec.scope === "us" ? renderUs(spec) : renderWorld(spec);
      return { ...r, regions: [{ kind: "title", ...r.titleBand }] };
    }
    case "symbol":
    case "point-symbol":
      return renderSymbol(spec);
    case "dot":
      return renderDot(spec);
    case "categorical":
      return renderCategorical(spec);
    case "points":
      return renderPoints(spec);
    case "flow":
      return renderFlow(spec);
    case "bivariate":
      return renderBivariate(spec);
    case "tilegrid":
      return renderTileGrid(spec);
    case "diverging":
      return renderDiverging(spec);
    case "classed":
      return renderClassed(spec);
    case "cartogram":
      return renderCartogram(spec);
    case "dorling":
      return renderDorling(spec);
    case "spike":
      return renderSpike(spec);
    case "composition":
      return renderComposition(spec);
    case "surface":
      return renderSurface(spec);
    default:
      throw new Error(`unknown map form: ${form}`);
  }
}

// ---------------------------------------------------------------------------
// Leak check (mirrors src/lib/guessMatch.ts hintLeaksAnswer, so authoring
// catches a leaking hint here instead of at runtime).
// ---------------------------------------------------------------------------

function normalize(s) {
  let out = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  for (const a of ["the ", "a ", "la ", "le ", "el "]) {
    if (out.startsWith(a)) {
      out = out.slice(a.length);
      break;
    }
  }
  return out.replace(/\s+/g, " ").trim();
}

function hintLeaks(hint, title, aliases) {
  const nh = normalize(hint);
  if (!nh) return false;
  return [title, ...aliases]
    .map(normalize)
    .filter((c) => c.length >= 3)
    .some((c) => nh.includes(c));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  mkdirSync(OUT_IMG_DIR, { recursive: true });

  // Verify dataset keys against the atlas. An unmatched key is a silent
  // rendering hole, so it throws rather than warns; for the categorical and
  // tile-grid forms every feature must also be COVERED, because an unshaded
  // state in a class map reads as a fourth, meaningless class.
  const usNames = new Set(usStates.map((f) => f.properties.name));
  const worldNames = new Set(
    worldCountries
      .map((f) => f.properties.name)
      .filter((n) => n !== "Antarctica"),
  );
  const ids = new Set();
  for (const spec of MAPS) {
    if (ids.has(spec.id)) throw new Error(`duplicate map id: ${spec.id}`);
    ids.add(spec.id);
    if (!spec.data) continue;
    const names = spec.scope === "us" ? usNames : worldNames;
    const unmatched = Object.keys(spec.data).filter((k) => !names.has(k));
    if (unmatched.length) {
      throw new Error(`[${spec.id}] unmatched dataset keys: ${unmatched.join(", ")}`);
    }
    const form = spec.form ?? "choropleth";
    if (form === "categorical" || form === "composition" || (form === "tilegrid" && spec.categories)) {
      const uncovered = [...names].filter((n) => spec.data[n] == null);
      const allowed = new Set(spec.allowUncovered ?? []);
      const bad = uncovered.filter((n) => !allowed.has(n));
      if (bad.length) {
        console.warn(`  [${spec.id}] features with no class: ${bad.join(", ")}`);
      }
    }
  }

  const entries = [];
  const embedded = {};
  for (const spec of MAPS) {
    // Author-time leak check on hints.
    for (const h of spec.hints) {
      if (hintLeaks(h, spec.title, spec.aliases)) {
        throw new Error(`[${spec.id}] hint leaks the answer: "${h}"`);
      }
    }

    const r = renderSpec(spec);
    // Palette quantisation: these are flat-colour maps with few distinct
    // tones, so an indexed PNG is visually identical and roughly a third the
    // size. The whole set is base64-embedded into the server bundle, so the
    // saving matters.
    const png = await sharp(Buffer.from(r.svg))
      .png({ palette: true, quality: 92, effort: 8 })
      .toBuffer();
    const outPath = join(OUT_IMG_DIR, `${spec.id}.png`);
    writeFileSync(outPath, png);
    embedded[`static:${spec.id}`] = png.toString("base64");
    console.log(`  wrote ${spec.id}.png (${r.W}x${r.H}, ${(png.length / 1024).toFixed(0)}KB)`);

    entries.push({
      sourceId: "static-dataset",
      externalId: `static:${spec.id}`,
      // Carried through purely for the private answer-key page, which uses it
      // to group and filter the set. Nothing in the game reads it.
      form: spec.form ?? "choropleth",
      title: spec.title,
      aliases: spec.aliases,
      description: spec.description,
      imageUrl: `/generated-maps/${spec.id}.png`,
      width: r.W,
      height: r.H,
      mimeType: "image/png",
      attribution: {
        author: "Map of the Day (generated)",
        license: "CC0 1.0",
        licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
        sourcePageUrl: REPO_URL,
      },
      preauthoredRedactionRegions: r.regions,
      preauthoredHints: spec.hints,
    });
  }

  writeFileSync(OUT_JSON, JSON.stringify(entries, null, 2) + "\n");
  writeFileSync(OUT_B64, JSON.stringify(embedded) + "\n");
  const b64Kb = (JSON.stringify(embedded).length / 1024).toFixed(0);
  console.log(`\nWrote ${entries.length} entries to src/data/static-maps.json`);
  console.log(`Wrote ${entries.length} embedded images to src/data/generated-maps.b64.json (${b64Kb}KB)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
