import { MilitaryUnit } from '@ww2/shared/military-unit';
import { MilitaryUnitSquad } from '@ww2/shared/military-unit-squad';
import { UnitType } from '@ww2/shared/unit-type';
import { Coordinate } from 'ol/coordinate';
import { getCenter } from 'ol/extent';
import Geometry from 'ol/geom/Geometry';
import MultiPolygon from 'ol/geom/MultiPolygon';
import Polygon from 'ol/geom/Polygon';

export interface GridFootprint {
  columns: number;
  rows: number;
}

export interface PositionedMapSquad {
  squad: MilitaryUnitSquad<MilitaryUnit>;
  gridColumn: number;
  gridRow: number;
  columns: number;
  rows: number;
}

export interface MapSquadLayout {
  squads: PositionedMapSquad[];
  columns: number;
  rows: number;
}

export interface PositionedMapSquadOverlay {
  squad: MilitaryUnitSquad<MilitaryUnit>;
  coordinate: Coordinate;
  layout: MapSquadLayout;
}

interface PlacedSquad {
  squad: MilitaryUnitSquad<MilitaryUnit>;
  x: number;
  y: number;
  footprint: GridFootprint;
}

interface GeometryCandidate {
  x: number;
  y: number;
  coordinate: Coordinate;
  fullyInsideGeometry: boolean;
  insideSampleCount: number;
  insideCellCount: number;
  intersectsGeometry: boolean;
  distanceFromCenter: number;
  rowBias: number;
  columnBias: number;
}

const DEFAULT_GRID_CELL_SIZE = 32;
const FOOTPRINT_INSIDE_SAMPLE_INSET_RATIO = 0.1;

export const UNIT_GRID_FOOTPRINTS: Record<UnitType, GridFootprint> = {
  [UnitType.INFANTRY]: { columns: 1, rows: 1 },
  [UnitType.ARTILLERY]: { columns: 3, rows: 1 },
  [UnitType.TANK]: { columns: 2, rows: 1 },
  [UnitType.ANTI_AIR_GUN]: { columns: 2, rows: 2 },
  [UnitType.FACTORY]: { columns: 2, rows: 2 },
  [UnitType.FIGHTER_JET]: { columns: 2, rows: 2 },
  [UnitType.BOMBER]: { columns: 3, rows: 2 },
  [UnitType.TRANSPORT]: { columns: 3, rows: 1 },
  [UnitType.DESTROYER]: { columns: 3, rows: 1 },
  [UnitType.SUBMARINE]: { columns: 3, rows: 1 },
  [UnitType.BATTLESHIP]: { columns: 4, rows: 1 },
  [UnitType.AIRCRAFT_CARRIER]: { columns: 5, rows: 1 },
};

export function layoutMapSquadsInGeometry(
  squads: MilitaryUnitSquad<MilitaryUnit>[],
  geometry: Geometry,
  cellSize = DEFAULT_GRID_CELL_SIZE,
): PositionedMapSquadOverlay[] {
  const occupied = new Set<string>();
  const center = getGeometryInteriorCoordinate(geometry);

  return [...squads].sort(compareSquadsForLayout).map((squad) => {
    const footprint = UNIT_GRID_FOOTPRINTS[squad.type];
    const placement = placeSquadInGeometry(squad, footprint, geometry, center, cellSize, occupied);

    return {
      squad,
      coordinate: placement.coordinate,
      layout: createSingleSquadLayout(squad, footprint),
    };
  });
}

export function layoutMapSquads(squads: MilitaryUnitSquad<MilitaryUnit>[]): MapSquadLayout {
  if (squads.length === 0) {
    return { squads: [], columns: 0, rows: 0 };
  }

  const occupied = new Set<string>();
  const placedSquads = [...squads]
    .sort(compareSquadsForLayout)
    .map((squad) => placeSquad(squad, occupied));

  const minColumn = Math.min(...placedSquads.map((placed) => placed.x));
  const minRow = Math.min(...placedSquads.map((placed) => placed.y));
  const maxColumn = Math.max(...placedSquads.map((placed) => placed.x + placed.footprint.columns));
  const maxRow = Math.max(...placedSquads.map((placed) => placed.y + placed.footprint.rows));

  return {
    squads: placedSquads.map((placed) => ({
      squad: placed.squad,
      gridColumn: placed.x - minColumn + 1,
      gridRow: placed.y - minRow + 1,
      columns: placed.footprint.columns,
      rows: placed.footprint.rows,
    })),
    columns: maxColumn - minColumn,
    rows: maxRow - minRow,
  };
}

export function createSingleSquadLayout(
  squad: MilitaryUnitSquad<MilitaryUnit>,
  footprint = UNIT_GRID_FOOTPRINTS[squad.type],
): MapSquadLayout {
  return {
    squads: [
      {
        squad,
        gridColumn: 1,
        gridRow: 1,
        columns: footprint.columns,
        rows: footprint.rows,
      },
    ],
    columns: footprint.columns,
    rows: footprint.rows,
  };
}

function compareSquadsForLayout(
  first: MilitaryUnitSquad<MilitaryUnit>,
  second: MilitaryUnitSquad<MilitaryUnit>,
): number {
  const firstFootprint = UNIT_GRID_FOOTPRINTS[first.type];
  const secondFootprint = UNIT_GRID_FOOTPRINTS[second.type];
  const firstArea = firstFootprint.columns * firstFootprint.rows;
  const secondArea = secondFootprint.columns * secondFootprint.rows;

  return (
    secondArea - firstArea ||
    first.nationality.localeCompare(second.nationality) ||
    first.type.localeCompare(second.type) ||
    first.id.localeCompare(second.id)
  );
}

function placeSquad(squad: MilitaryUnitSquad<MilitaryUnit>, occupied: Set<string>): PlacedSquad {
  const footprint = UNIT_GRID_FOOTPRINTS[squad.type];
  const maxRadius = Math.max(12, occupied.size + footprint.columns + footprint.rows);
  const candidates = candidatePositions(maxRadius, footprint);

  for (const candidate of candidates) {
    if (canPlace(candidate.x, candidate.y, footprint, occupied)) {
      occupy(candidate.x, candidate.y, footprint, occupied);
      return { squad, x: candidate.x, y: candidate.y, footprint };
    }
  }

  throw new Error(`Unable to place map squad ${squad.id}.`);
}

function placeSquadInGeometry(
  squad: MilitaryUnitSquad<MilitaryUnit>,
  footprint: GridFootprint,
  geometry: Geometry,
  center: Coordinate,
  cellSize: number,
  occupied: Set<string>,
): GeometryCandidate {
  const candidates = geometryCandidatePositions(geometry, footprint, center, cellSize);

  for (const candidate of candidates) {
    if (canPlace(candidate.x, candidate.y, footprint, occupied)) {
      occupy(candidate.x, candidate.y, footprint, occupied);
      return candidate;
    }
  }

  throw new Error(`Unable to place map squad ${squad.id}.`);
}

function candidatePositions(radius: number, footprint: GridFootprint): { x: number; y: number }[] {
  const candidates: {
    x: number;
    y: number;
    distance: number;
    rowBias: number;
    columnBias: number;
  }[] = [];

  for (let y = -radius; y <= radius; y++) {
    for (let x = -radius; x <= radius; x++) {
      const centerX = x + (footprint.columns - 1) / 2;
      const centerY = y + (footprint.rows - 1) / 2;
      candidates.push({
        x,
        y,
        distance: centerX * centerX + centerY * centerY,
        rowBias: Math.abs(y),
        columnBias: Math.abs(x),
      });
    }
  }

  return candidates
    .sort(
      (first, second) =>
        first.distance - second.distance ||
        first.rowBias - second.rowBias ||
        first.columnBias - second.columnBias ||
        first.y - second.y ||
        first.x - second.x,
    )
    .map(({ x, y }) => ({ x, y }));
}

function canPlace(x: number, y: number, footprint: GridFootprint, occupied: Set<string>): boolean {
  for (let row = y; row < y + footprint.rows; row++) {
    for (let column = x; column < x + footprint.columns; column++) {
      if (occupied.has(gridKey(column, row))) {
        return false;
      }
    }
  }

  return true;
}

function occupy(x: number, y: number, footprint: GridFootprint, occupied: Set<string>): void {
  for (let row = y; row < y + footprint.rows; row++) {
    for (let column = x; column < x + footprint.columns; column++) {
      occupied.add(gridKey(column, row));
    }
  }
}

function gridKey(column: number, row: number): string {
  return `${column}:${row}`;
}

function geometryCandidatePositions(
  geometry: Geometry,
  footprint: GridFootprint,
  center: Coordinate,
  cellSize: number,
): GeometryCandidate[] {
  const extent = geometry.getExtent();
  const minX = extent[0];
  const minY = extent[1];
  const width = extent[2] - extent[0];
  const height = extent[3] - extent[1];
  const columnCount = Math.max(footprint.columns, Math.ceil(width / cellSize));
  const rowCount = Math.max(footprint.rows, Math.ceil(height / cellSize));
  const originX = minX + (width - columnCount * cellSize) / 2;
  const originY = minY + (height - rowCount * cellSize) / 2;
  const candidates: GeometryCandidate[] = [];

  for (let y = 0; y <= rowCount - footprint.rows; y++) {
    for (let x = 0; x <= columnCount - footprint.columns; x++) {
      candidates.push(
        createGeometryCandidate(x, y, originX, originY, footprint, geometry, center, cellSize),
      );
    }
  }

  return candidates.sort(compareGeometryCandidates);
}

function createGeometryCandidate(
  x: number,
  y: number,
  minX: number,
  minY: number,
  footprint: GridFootprint,
  geometry: Geometry,
  center: Coordinate,
  cellSize: number,
): GeometryCandidate {
  const footprintMinX = minX + x * cellSize;
  const footprintMinY = minY + y * cellSize;
  const footprintMaxX = footprintMinX + footprint.columns * cellSize;
  const footprintMaxY = footprintMinY + footprint.rows * cellSize;
  const coordinate: Coordinate = [
    footprintMinX + (footprint.columns * cellSize) / 2,
    footprintMinY + (footprint.rows * cellSize) / 2,
  ];
  const insideSampleCount = countInsideFootprintSamples(
    footprintMinX,
    footprintMinY,
    footprint,
    geometry,
    cellSize,
  );
  const requiredInsideSampleCount = footprintInsideSampleCount(footprint);

  let insideCellCount = 0;
  for (let row = 0; row < footprint.rows; row++) {
    for (let column = 0; column < footprint.columns; column++) {
      const cellCenter: Coordinate = [
        footprintMinX + column * cellSize + cellSize / 2,
        footprintMinY + row * cellSize + cellSize / 2,
      ];
      if (geometry.intersectsCoordinate(cellCenter)) {
        insideCellCount++;
      }
    }
  }

  return {
    x,
    y,
    coordinate,
    fullyInsideGeometry: insideSampleCount === requiredInsideSampleCount,
    insideSampleCount,
    insideCellCount,
    intersectsGeometry: geometry.intersectsExtent([
      footprintMinX,
      footprintMinY,
      footprintMaxX,
      footprintMaxY,
    ]),
    distanceFromCenter: distanceSquared(coordinate, center),
    rowBias: Math.abs(coordinate[1] - center[1]),
    columnBias: Math.abs(coordinate[0] - center[0]),
  };
}

function compareGeometryCandidates(first: GeometryCandidate, second: GeometryCandidate): number {
  return (
    Number(second.fullyInsideGeometry) - Number(first.fullyInsideGeometry) ||
    second.insideSampleCount - first.insideSampleCount ||
    second.insideCellCount - first.insideCellCount ||
    Number(second.intersectsGeometry) - Number(first.intersectsGeometry) ||
    first.distanceFromCenter - second.distanceFromCenter ||
    first.rowBias - second.rowBias ||
    first.columnBias - second.columnBias ||
    first.y - second.y ||
    first.x - second.x
  );
}

function countInsideFootprintSamples(
  footprintMinX: number,
  footprintMinY: number,
  footprint: GridFootprint,
  geometry: Geometry,
  cellSize: number,
): number {
  return footprintSamplePoints(footprintMinX, footprintMinY, footprint, cellSize).filter((point) =>
    geometry.intersectsCoordinate(point),
  ).length;
}

function footprintInsideSampleCount(footprint: GridFootprint): number {
  return footprintSamplePoints(0, 0, footprint, 1).length;
}

function footprintSamplePoints(
  footprintMinX: number,
  footprintMinY: number,
  footprint: GridFootprint,
  cellSize: number,
): Coordinate[] {
  const footprintWidth = footprint.columns * cellSize;
  const footprintHeight = footprint.rows * cellSize;
  const inset = cellSize * FOOTPRINT_INSIDE_SAMPLE_INSET_RATIO;
  const left = footprintMinX + inset;
  const right = footprintMinX + footprintWidth - inset;
  const bottom = footprintMinY + inset;
  const top = footprintMinY + footprintHeight - inset;
  const centerX = footprintMinX + footprintWidth / 2;
  const centerY = footprintMinY + footprintHeight / 2;

  const points: Coordinate[] = [
    [left, bottom],
    [right, bottom],
    [left, top],
    [right, top],
    [centerX, centerY],
  ];

  for (let row = 0; row < footprint.rows; row++) {
    for (let column = 0; column < footprint.columns; column++) {
      points.push([
        footprintMinX + column * cellSize + cellSize / 2,
        footprintMinY + row * cellSize + cellSize / 2,
      ]);
    }
  }

  return points;
}

function getGeometryInteriorCoordinate(geometry: Geometry): Coordinate {
  if (geometry instanceof Polygon) {
    return geometry.getInteriorPoint().getCoordinates();
  }

  if (geometry instanceof MultiPolygon) {
    const extentCenter = getCenter(geometry.getExtent());
    return geometry
      .getInteriorPoints()
      .getPoints()
      .map((point) => point.getCoordinates())
      .sort(
        (first, second) =>
          distanceSquared(first, extentCenter) - distanceSquared(second, extentCenter),
      )[0];
  }

  return getCenter(geometry.getExtent());
}

function distanceSquared(first: Coordinate, second: Coordinate): number {
  const deltaX = first[0] - second[0];
  const deltaY = first[1] - second[1];
  return deltaX * deltaX + deltaY * deltaY;
}
