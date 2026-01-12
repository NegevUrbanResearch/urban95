# Cities for Children: Beer Sheva Streetscape Analysis

A spatial analysis project to visualize and assess how child-friendly different parts of Beer Sheva's streetscape are. This project is a collaboration between **Urban95** and **NUR** as part of the "Cities for Children" initiative. 

## Getting Started

New users should first unzip `data.zip` to extract the required data files, then install dependencies:

```bash
pip install -r requirements.txt
```

## Project Structure

```
urban95/
├── data/
│   ├── buildings/              # Building footprints shapefile and associated files
│   ├── roads/                  # Road network shapefile and associated files
│   ├── sidewalks_and_trees/    # Sidewalk and tree infrastructure shapefile and associated files
│   ├── amenities/              # Amenities shapefile and associated files
│   ├── parks_and_greenspaces/  # Parks and greenspace shapefile and associated files
│   └── population/             # Population demographics shapefile and associated files
└── README.md
```

## Data Description

### Spatial Data

- **Buildings** (`data/buildings/`): Building footprint data for Beer Sheva
- **Roads** (`data/roads/`): Road network and street infrastructure
- **Sidewalks and Trees** (`data/sidewalks_and_trees/`): Sidewalk infrastructure and tree coverage data
- **Amenities** (`data/amenities/`): Points of interest and amenities relevant to child-friendliness
- **Parks and Greenspaces** (`data/parks_and_greenspaces/`): Public parks and green areas
- **Population** (`data/population/`): Population demographics and statistics

## Analysis Goals

The project aims to:

1. Map the spatial distribution of child-friendly infrastructure
2. Identify areas with high/low child-friendliness scores
3. Analyze accessibility to greenery, amenities, etc.

## Next Steps

- Exploratory Data Analysis (EDA) of spatial datasets
- Geospatial analysis and visualization
- Development of child-friendliness metrics
- Creation of interactive maps and visualizations