import fs from 'fs';
import { DOMParser } from 'xmldom';
import xpath from 'xpath';

// Read the KML file
const kmlContent = fs.readFileSync('./components/data/input.kml', 'utf8');
const kmlDoc = new DOMParser().parseFromString(kmlContent, 'application/xml');

// Read existing paths JSON (from your SVG processing)
const existingPaths = JSON.parse(fs.readFileSync('./components/data/map-paths.json', 'utf8'));

// Extract points data from KML descriptions
const kmlPointsData = {};

// Use getElementsByTagName instead of xpath to avoid namespace issues
const placemarks = kmlDoc.getElementsByTagName('Placemark');

for (let i = 0; i < placemarks.length; i++) {
  const placemark = placemarks[i];
  
  // Check if this placemark has a LineString
  const lineStrings = placemark.getElementsByTagName('LineString');
  if (lineStrings.length === 0) continue;
  
  const nameElement = placemark.getElementsByTagName('name')[0];
  const descElement = placemark.getElementsByTagName('description')[0];
  
  if (!descElement) continue;
  
  const name = nameElement?.textContent?.trim();
  const description = descElement.textContent?.trim() || '';
  
  // Extract points count from description
  const pointsMatch = description.match(/Points:\s*(\d+)/i);
  if (pointsMatch && name) {
    kmlPointsData[name.toUpperCase()] = parseInt(pointsMatch[1]);
  }
}

// Add points property to existing edges based on path name matching
const updatedGraph = { ...existingPaths };

for (const edge of updatedGraph.edges) {
  // Try to match by constructing path name from from->to
  const pathName1 = `${edge.from} & ${edge.to}`;
  const pathName2 = `${edge.to} & ${edge.from}`;
  
  // Check if we have points data for this path
  edge.points = kmlPointsData[pathName1] || kmlPointsData[pathName2] || 0;
}

// Output updated paths with points data
fs.writeFileSync('./components/data/map-paths.json', JSON.stringify(updatedGraph, null, 2));

console.log('KML points extraction complete!');
console.log(`Found points data for ${Object.keys(kmlPointsData).length} paths`);
console.log('Updated map-paths.json with points property');