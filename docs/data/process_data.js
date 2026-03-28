const fs = require('fs');
const path = require('path');

const inputDir = path.join(__dirname, '..', '..', 'new-data', 'new-data');
const outputDir = __dirname;
const outputFile = path.join(outputDir, 'amenities_new.geojson');

function getCentroid(geometry) {
  if (!geometry || !geometry.coordinates) return [0, 0];
  if (geometry.type === 'Point') {
    return geometry.coordinates;
  }
  let sumX = 0, sumY = 0, count = 0;
  
  function addCoords(coords) {
    if (typeof coords[0] === 'number') {
      sumX += coords[0];
      sumY += coords[1];
      count++;
    } else {
      for (let i = 0; i < coords.length; i++) {
        addCoords(coords[i]);
      }
    }
  }
  
  addCoords(geometry.coordinates);
  if (count === 0) return [0,0];
  return [sumX / count, sumY / count];
}

const allFeatures = [];

fs.readdirSync(inputDir).forEach(file => {
  if (!file.endsWith('.geojson')) return;
  
  const extLength = '.geojson'.length;
  let amenityType = file.slice(0, -extLength);
  
  // Format the amenityType to be a valid label. We'll use this exact string in the UI logic.
  // We normalize to avoid spaces and special characters. For simplicity, we just use the raw name.
  
  const inputFilePath = path.join(inputDir, file);
  
  console.log(`Processing ${file}...`);
  
  if (file === 'trees.geojson' || file === 'parks.geojson') {
    console.log(`Copying ${file} directly to data/ directory...`);
    fs.copyFileSync(inputFilePath, path.join(outputDir, file));
    // Do not include trees and parks in the merged amenities point file.
    return;
  }
  
  try {
    const rawData = fs.readFileSync(inputFilePath, 'utf8');
    const geojson = JSON.parse(rawData);
    
    if (geojson && geojson.features && Array.isArray(geojson.features)) {
      geojson.features.forEach(feature => {
        const center = getCentroid(feature.geometry);
        const newFeature = {
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: center
          },
          properties: {
             ...feature.properties,
             amenity_type: amenityType
          }
        };
        allFeatures.push(newFeature);
      });
    }
  } catch (err) {
    console.error(`Error processing ${file}:`, err.message);
  }
});

const outputGeojson = {
  type: "FeatureCollection",
  features: allFeatures
};

console.log(`Writing ${allFeatures.length} features to amenities_new.geojson...`);
fs.writeFileSync(outputFile, JSON.stringify(outputGeojson));
console.log('Done!');
