/**
 * Map Alberta municipalities to Alberta 511 alert regions.
 * Alberta 511 uses regions like: Grasslands, Foothills, Rocky Mountains, etc.
 * This maps user-selected municipalities to those region codes.
 */

// Mapping of municipality / location to Alberta 511 regions
const MUNICIPALITY_TO_REGION: Record<string, string[]> = {
  // South / Grasslands region
  "Medicine Hat": ["Grasslands", "South"],
  "Cypress County": ["Grasslands", "South"],
  "Bow Island": ["Grasslands", "South"],
  "Lethbridge": ["Grasslands", "South"],
  "Taber": ["Grasslands", "South"],
  "Warner": ["Grasslands", "South"],
  "Vulcan": ["Grasslands", "South"],
  "Acadia": ["Grasslands", "South"],
  
  // Southwest / Foothills / Rocky Mountains
  "Pincher Creek": ["Foothills", "Southwest"],
  "Cardston": ["Foothills", "Southwest"],
  "Willow Creek": ["Foothills", "Southwest"],
  
  // Central / Grasslands / Parkland
  "Drumheller": ["Central", "Grasslands"],
  "Kneehill": ["Central", "Grasslands"],
  "Starland": ["Central", "Grasslands"],
  "Wheatland": ["Central", "Grasslands"],
  "Stettler": ["Central", "Grasslands"],
  "Calgary": ["Central", "Foothills"],
  "Airdrie": ["Central", "Foothills"],
  "Chestermere": ["Central", "Foothills"],
  "Foothills": ["Foothills", "Central"],
  
  // Red Deer / Central Parkland
  "Red Deer": ["Central", "Parkland"],
  "Lacombe": ["Central", "Parkland"],
  "Sylvan Lake": ["Central", "Parkland"],
  "Ponoka": ["Central", "Parkland"],
  
  // Mountain region
  "Rocky Mountain House": ["Rocky Mountains", "Central"],
  "Clearwater County": ["Rocky Mountains", "Central"],
  "Banff": ["Rocky Mountains"],
  "Canmore": ["Rocky Mountains"],
  "Kananaskis": ["Rocky Mountains"],
  "Jasper": ["Rocky Mountains"],
  
  // East Central / Parkland
  "Camrose": ["Central", "Parkland"],
  "Leduc": ["Central", "Parkland"],
  "Wetaskiwin": ["Central", "Parkland"],
  "Beaver County": ["Central", "Parkland"],
  
  // Edmonton area / North
  "Edmonton": ["North", "Central"],
  "Sherwood Park": ["North", "Central"],
  "St. Albert": ["North", "Central"],
  "Spruce Grove": ["North", "Central"],
  
  // Northeast
  "Wainwright": ["Northeast", "Grasslands"],
  "Provost": ["Northeast", "Grasslands"],
  "Vermilion River": ["Northeast", "Grasslands"],
  "Cold Lake": ["Northeast"],
  "Bonnyville": ["Northeast"],
  "St. Paul": ["Northeast"],
  
  // North / Northwest
  "Athabasca": ["North", "Northwest"],
  "Westlock": ["North", "Northwest"],
  "Barrhead": ["North", "Northwest"],
  "Thorhild": ["North", "Northwest"],
  
  // West / Mountain Foothills
  "Edson": ["West", "Foothills"],
  "Hinton": ["West", "Foothills"],
  "Yellowhead County": ["West", "Foothills"],
  
  // Wood Buffalo / Far North
  "Wood Buffalo": ["North", "Northwest"],
  "Fort McMurray": ["North", "Northeast"],
  "Fort Chipewyan": ["North", "Northeast"],
  
  // Slave Lake / Northwest
  "Slave Lake": ["Northwest"],
  "High Prairie": ["Northwest"],
  "Lesser Slave River": ["Northwest"],
  
  // Grande Cache / Far West
  "Grande Cache": ["West"],
  
  // Valleyview area / Northwest
  "Valleyview": ["Northwest"],
  "Greenview": ["Northwest"],
  
  // Grande Prairie area / Northwest
  "Grande Prairie": ["Northwest"],
  
  // Peace River / Far Northwest
  "Peace River": ["Northwest"],
  "Fairview": ["Northwest"],
};

/**
 * Given a municipality name, return the Alberta 511 region(s) it belongs to.
 * Returns an empty array if not found.
 */
export function municipalityToRegions(municipality: string): string[] {
  if (!municipality) return [];
  
  // Extract just the city/county name without ", AB"
  const name = municipality.replace(/,\s*AB.*$/, "").trim();
  
  // Try exact match first
  if (MUNICIPALITY_TO_REGION[name]) {
    return MUNICIPALITY_TO_REGION[name];
  }
  
  // Try partial match (case-insensitive)
  const lower = name.toLowerCase();
  for (const [key, regions] of Object.entries(MUNICIPALITY_TO_REGION)) {
    if (key.toLowerCase() === lower) {
      return regions;
    }
  }
  
  return [];
}

/**
 * Given user's location (municipality), check if an alert's regions match.
 * Returns true if the alert is relevant to the user's location.
 */
export function isAlertRelevantToLocation(
  userLocation: string | null,
  alertRegions: string[]
): boolean {
  if (!userLocation || !alertRegions || alertRegions.length === 0) {
    // Broad alerts with no region specified should be shown to everyone
    return true;
  }
  
  const userRegions = municipalityToRegions(userLocation);
  if (userRegions.length === 0) {
    // User location not mapped; show all alerts as fallback
    return true;
  }
  
  // Check if any user region matches any alert region
  for (const ur of userRegions) {
    for (const ar of alertRegions) {
      if (ur.toLowerCase() === ar.toLowerCase()) {
        return true;
      }
    }
  }
  
  return false;
}
