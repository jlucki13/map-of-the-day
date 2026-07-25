/**
 * Build-time generator for the curated THEMATIC map dataset.
 *
 * Renders a set of choropleth maps from public-domain boundaries
 * (us-atlas / world-atlas → US Census TIGER + Natural Earth, both public
 * domain) shaded by real public statistics, into self-hosted PNGs under
 * public/generated-maps/, and emits src/data/static-maps.json.
 *
 * Why generate our own: the "guess the topic" game needs thematic data maps,
 * and freely-licensed ones can't be fetched/verified from the build sandbox
 * (Wikimedia is network-blocked). Generating them ourselves gives CC0
 * licensing, pixel-exact redaction (we know exactly where the title is), and
 * a dataset that actually works offline in mock mode.
 *
 * Each map renders with its title visible (that PNG is the stored "original"
 * shown at reveal); the ONLY redacted region is the title band at the top.
 * The legend is a bare numeric color scale with no words, so it leaks nothing
 * while still giving players a fair hint about the variable's magnitude.
 *
 * Run manually after changing data/specs:  node scripts/generate-maps.mjs
 * (dev-only deps: d3-geo, d3-scale, d3-scale-chromatic, topojson-client,
 * us-atlas, world-atlas. sharp is already a runtime dep.)
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { geoPath, geoNaturalEarth1 } from "d3-geo";
import { scaleSequential, scaleSequentialSqrt } from "d3-scale";
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

  // Warn about dataset keys that don't match any atlas feature name.
  const usNames = new Set(usStates.map((f) => f.properties.name));
  const worldNames = new Set(worldCountries.map((f) => f.properties.name));
  for (const spec of MAPS) {
    const names = spec.scope === "us" ? usNames : worldNames;
    const unmatched = Object.keys(spec.data).filter((k) => !names.has(k));
    if (unmatched.length) {
      console.warn(`  [${spec.id}] unmatched dataset keys: ${unmatched.join(", ")}`);
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

    const r = spec.scope === "us" ? renderUs(spec) : renderWorld(spec);
    const png = await sharp(Buffer.from(r.svg)).png().toBuffer();
    const outPath = join(OUT_IMG_DIR, `${spec.id}.png`);
    writeFileSync(outPath, png);
    embedded[`static:${spec.id}`] = png.toString("base64");
    console.log(`  wrote ${spec.id}.png (${r.W}x${r.H}, ${(png.length / 1024).toFixed(0)}KB)`);

    entries.push({
      sourceId: "static-dataset",
      externalId: `static:${spec.id}`,
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
      preauthoredRedactionRegions: [{ kind: "title", ...r.titleBand }],
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
