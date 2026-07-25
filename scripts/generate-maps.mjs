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

// ---------------------------------------------------------------------------
// Formatters (no units — bare magnitudes keep the legend a fair, wordless hint)
// ---------------------------------------------------------------------------

const intComma = (n) => Math.round(n).toLocaleString("en-US");
const peopleMillions = (m) =>
  m >= 1000 ? `${(m / 1000).toFixed(2)}B` : m >= 100 ? `${Math.round(m)}M` : `${m}M`;
const peopleAbs = (n) =>
  n >= 1e9 ? `${(n / 1e9).toFixed(2)}B` : `${(n / 1e6).toFixed(1)}M`;

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
    interpolator: chromatic.interpolatePurples,
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
    interpolator: chromatic.interpolateYlOrRd,
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
    interpolator: chromatic.interpolateReds,
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
    interpolator: chromatic.interpolateBuPu,
    scaleType: "sqrt",
    fmt: (n) => (n >= 1000 ? `${(n / 1000).toFixed(1)}M` : intComma(n)),
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
