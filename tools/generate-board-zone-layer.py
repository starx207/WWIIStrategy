#!/usr/bin/env python3
"""Generate selectable OpenLayers zones from public/images/game-board.svg.

The source SVG is mostly an embedded PNG, so this script extracts the PNG,
segments the board by its stable palette colors, and writes simplified GeoJSON
polygons in the same 2772x1512 pixel coordinate space used by the app's
OpenLayers image projection.
"""

from __future__ import annotations

import argparse
import base64
import io
import json
import math
import re
import subprocess
from collections import defaultdict
from pathlib import Path
from typing import Any

import numpy as np
from PIL import Image, ImageDraw


IMAGE_WIDTH = 2772
IMAGE_HEIGHT = 1512

PALETTE = [
    ("sea", (0, 28, 84), 45),
    ("tan", (197, 185, 155), 45),
    ("rust", (125, 73, 50), 45),
    ("dark-gray", (118, 122, 115), 45),
    ("green", (115, 131, 38), 45),
    ("orange", (199, 137, 64), 45),
    ("neutral-gray", (197, 198, 194), 45),
    ("white", (255, 255, 255), 50),
    ("black", (0, 0, 0), 50),
]

SELECTABLE_LAND_COLORS = {"tan", "rust", "dark-gray", "green", "orange"}
NEUTRAL_LAND_COLOR = "neutral-gray"

LAND_SEED_THRESHOLD = 12
LAND_MIN_AREA = 500
LAND_MANUAL_MIN_AREA = 20
LAND_OUTLINE_EXPANSION_RADIUS = 3
LAND_CLOSE_RADIUS = 2
LAND_SIMPLIFICATION_EPSILON = 2.0
LAND_MAX_SIMPLIFICATION_EPSILON = 4.25

SEA_MIN_AREA = 500
SEA_SPLIT_EROSION_RADIUS = 2
SEA_OUTLINE_EXPANSION_RADIUS = 4
SEA_CLOSE_RADIUS = 1
SEA_SIMPLIFICATION_EPSILON = 3.0
COASTAL_ADJACENCY_RADIUS = 10
TERRITORY_ADJACENCY_RADIUS = 18
MANUAL_TERRITORY_ADJACENCIES = [
    ("Sea Zone 25", "Sea Zone 42"),
    ("Sea Zone 21", "Sea Zone 43"),
    ("Sea Zone 20", "Sea Zone 54"),
    ("Sea Zone 19", "Sea Zone 20"),
    ("Sea Zone 15", "Sea Zone 34"),
    ("Sea Zone 3", "Sea Zone 4"),
    ("Panama", "Mexico"),
    ("Eastern United States", "Central United States"),
    ("Eastern Canada", "Western Canada"),
]

SPECIAL_ADJACENCIES = [
    {
        "from": "Sea Zone 15",
        "to": "Sea Zone 34",
        "kind": "canal",
        "requiredTerritories": ["Anglo-Egypt", "Trans-Jordan"],
    },
    {
        "from": "Sea Zone 20",
        "to": "Sea Zone 54",
        "kind": "canal",
        "requiredTerritories": ["Panama"],
    },
]

# These are blue inland lakes in the board art, not sea zones.
INLAND_SEA_EXCLUSION_RECTS = [
    (1750, 220, 1900, 330),  # Lake Baikal
    (80, 360, 210, 480),  # Great Lakes
    (1220, 480, 1380, 700),  # Caspian Sea
    (1880, 490, 1950, 570),  # Manchurian lake
]

SEA_DIVIDER_LINES = [
    # The dotted sea borders are visually present but not connected pixel-wise.
    # These virtual dividers keep adjacent sea zones from merging through dash gaps.
    ((430, 285), (430, 555)),  # printed sea zones 8 / 9
    ((526, 285), (526, 555)),  # printed sea zones 7 / 8
    ((320, 376), (430, 376)),  # printed sea zone 9 top edge
    ((2345, 343), (2345, 700)),  # printed sea zones 56 / 57
]

SEA_MERGE_RECTS = [
    # Zone 7 is split into two blue islands by the United Kingdom coastline.
    (520, 280, 700, 575),
    # The sea zone around French Indochina is disconnected by the peninsula,
    # but it is a single selectable sea zone on the board.
    (1580, 760, 1880, 1060),
]

# Some territories are intentionally printed as island groups, or are split by
# logos, IPC markers, canals, and unit silhouettes. These named regions keep
# those same-color fragments selectable as a single feature without changing
# the sea-zone extraction.
LAND_MERGE_RECTS = [
    {
        "name": "Panama",
        "color": "green",
        "rect": (25, 610, 155, 830),
        "min_area": 500,
        "close_radius": 2,
    },
    {
        "name": "Mexico",
        "color": "green",
        "rect": (2580, 560, 2745, 770),
        "min_area": 20,
        "close_radius": 2,
        "extra_circles": [(2670, 637, 18)],
    },
    {
        "name": "Midway Island",
        "color": "green",
        "rect": (2380, 450, 2430, 500),
        "min_area": 20,
        "close_radius": 2,
    },
    {
        "name": "Hawaiian Islands",
        "color": "green",
        "rect": (2350, 700, 2490, 825),
        "min_area": 20,
        "shape": "blob",
        "blob_radius": 10,
    },
    {
        "name": "United Kingdom",
        "color": "tan",
        "rect": (470, 50, 710, 350),
        "min_area": 500,
        "close_radius": 4,
    },
    {
        "name": "New Zealand",
        "color": "tan",
        "rect": (2280, 1160, 2450, 1425),
        "min_area": 20,
        "shape": "manual",
        "manual_polygons": [
            [
                (2386, 1225),
                (2411, 1256),
                (2428, 1282),
                (2414, 1320),
                (2382, 1340),
                (2362, 1398),
                (2328, 1420),
                (2298, 1394),
                (2312, 1359),
                (2355, 1322),
                (2358, 1276),
                (2368, 1244),
            ],
        ],
    },
    {
        "name": "Japan",
        "color": "orange",
        "rect": (2000, 330, 2210, 680),
        "min_area": 100,
        "close_radius": 5,
    },
    {
        "name": "Okinawa",
        "color": "orange",
        "rect": (1980, 760, 2110, 870),
        "min_area": 20,
        "close_radius": 3,
    },
    {
        "name": "Wake Island",
        "color": "orange",
        "rect": (2100, 790, 2255, 870),
        "min_area": 20,
        "close_radius": 2,
    },
    {
        "name": "Manila",
        "color": "orange",
        "rect": (1840, 860, 2010, 990),
        "min_area": 20,
        "shape": "blob",
        "blob_radius": 12,
    },
    {
        "name": "Borneo",
        "color": "orange",
        "rect": (1830, 1000, 1980, 1115),
        "min_area": 20,
        "close_radius": 8,
    },
    {
        "name": "Caroline Islands",
        "color": "orange",
        "rect": (2050, 940, 2185, 1000),
        "min_area": 15,
        "shape": "blob",
        "blob_radius": 10,
    },
    {
        "name": "Solomon Islands",
        "color": "orange",
        "rect": (2220, 1060, 2385, 1185),
        "min_area": 15,
        "shape": "blob",
        "blob_radius": 10,
    },
]

NATIONALITY_BY_TERRAIN_COLOR = {
    "dark-gray": "de",
    "green": "us",
    "orange": "ja",
    "rust": "su",
    "tan": "uk",
}

SEA_ZONE_BOARD_NUMBERS = {
    "sea-001": 3,
    "sea-002": 4,
    "sea-003": 1,
    "sea-004": 2,
    "sea-005": 6,
    "sea-006": 62,
    "sea-007": 63,
    "sea-008": 7,
    "sea-009": 5,
    "sea-010": 64,
    "sea-011": 9,
    "sea-012": 8,
    "sea-013": 61,
    "sea-014": 60,
    "sea-015": 57,
    "sea-016": 56,
    "sea-017": 55,
    "sea-018": 10,
    "sea-019": 11,
    "sea-020": 12,
    "sea-021": 13,
    "sea-022": 14,
    "sea-023": 16,
    "sea-024": 59,
    "sea-025": 20,
    "sea-026": 19,
    "sea-027": 15,
    "sea-028": 58,
    "sea-029": 51,
    "sea-030": 52,
    "sea-031": 53,
    "sea-032": 54,
    "sea-033": 18,
    "sea-034": 17,
    "sea-035": 35,
    "sea-036": 36,
    "sea-037": 49,
    "sea-038": 34,
    "sea-039": 48,
    "sea-040": 50,
    "sea-041": 21,
    "sea-042": 22,
    "sea-043": 23,
    "sea-044": 37,
    "sea-045": 47,
    "sea-046": 45,
    "sea-047": 44,
    "sea-048": 43,
    "sea-049": 24,
    "sea-050": 33,
    "sea-051": 32,
    "sea-052": 31,
    "sea-053": 38,
    "sea-054": 46,
    "sea-055": 25,
    "sea-056": 26,
    "sea-057": 27,
    "sea-058": 28,
    "sea-059": 41,
    "sea-060": 42,
    "sea-061": 29,
    "sea-062": 30,
    "sea-063": 39,
    "sea-064": 40,
}

SEA_ZONE_ISLAND_HOLE_BOARD_NUMBERS = {19, 45, 47, 49, 50, 51, 52, 56, 58}

LAND_ZONE_NAMES = {
    "land-001": "Greenland",
    "land-002": "United Kingdom",
    "land-003": "Norway",
    "land-004": "Karelia S.S.R.",
    "land-005": "Archangel",
    "land-006": "Russia",
    "land-007": "Evenki National Okrug",
    "land-008": "Yakut S.S.R.",
    "land-009": "Soviet Far East",
    "land-010": "Alaska",
    "land-011": "Western Canada",
    "land-012": "Eastern Canada",
    "land-013": "Eastern Europe",
    "land-014": "Belorussia",
    "land-015": "West Russia",
    "land-016": "Novosibirsk",
    "land-017": "Buryatia S.S.R.",
    "land-018": "Germany",
    "land-019": "Manchuria",
    "land-020": "Midway Island",
    "land-021": "Eastern United States",
    "land-022": "Western Europe",
    "land-023": "Balkans",
    "land-024": "Ukraine S.S.R.",
    "land-025": "Caucasus",
    "land-026": "Kazakh S.S.R.",
    "land-027": "Sinkiang",
    "land-028": "China",
    "land-029": "Japan",
    "land-030": "Western United States",
    "land-031": "Central United States",
    "land-032": "Gibraltar",
    "land-033": "Southern Europe",
    "land-034": "Persia",
    "land-035": "Kwangtung",
    "land-036": "Mexico",
    "land-037": "Panama",
    "land-038": "West Indies",
    "land-039": "Algeria",
    "land-040": "Libya",
    "land-041": "Trans-Jordan",
    "land-042": "India",
    "land-043": "French Indochina",
    "land-044": "Okinawa",
    "land-045": "Wake Island",
    "land-046": "Hawaiian Islands",
    "land-047": "Brazil",
    "land-048": "French West Africa",
    "land-049": "Anglo-Egypt",
    "land-050": "Philippine Islands",
    "land-051": "French Equatorial Africa",
    "land-052": "Italian East Africa",
    "land-053": "Borneo",
    "land-054": "Caroline Islands",
    "land-055": "Belgian Congo",
    "land-056": "Rhodesia",
    "land-057": "East Indies",
    "land-058": "New Guinea",
    "land-059": "Solomon Islands",
    "land-060": "Union of South Africa",
    "land-061": "French Madagascar",
    "land-062": "Australia",
    "land-063": "New Zealand",
}


class DisjointSet:
    def __init__(self) -> None:
        self.parent = [0]
        self.area = [0]
        self.bbox: list[list[int]] = []
        self.sum_x = [0.0]
        self.sum_y = [0.0]

    def make(self, x0: int, x1: int, y: int) -> int:
        area = x1 - x0 + 1
        label = len(self.parent)
        self.parent.append(label)
        self.area.append(area)
        self.bbox.append([x0, y, x1, y])
        self.sum_x.append((x0 + x1) * area / 2)
        self.sum_y.append(y * area)
        return label

    def find(self, label: int) -> int:
        while self.parent[label] != label:
            self.parent[label] = self.parent[self.parent[label]]
            label = self.parent[label]
        return label

    def union(self, left: int, right: int) -> int:
        left_root = self.find(left)
        right_root = self.find(right)

        if left_root == right_root:
            return left_root

        if self.area[left_root] < self.area[right_root]:
            left_root, right_root = right_root, left_root

        self.parent[right_root] = left_root
        self.area[left_root] += self.area[right_root]
        self.sum_x[left_root] += self.sum_x[right_root]
        self.sum_y[left_root] += self.sum_y[right_root]

        left_bbox = self.bbox[left_root - 1]
        right_bbox = self.bbox[right_root - 1]
        left_bbox[0] = min(left_bbox[0], right_bbox[0])
        left_bbox[1] = min(left_bbox[1], right_bbox[1])
        left_bbox[2] = max(left_bbox[2], right_bbox[2])
        left_bbox[3] = max(left_bbox[3], right_bbox[3])

        return left_root


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--input",
        type=Path,
        default=Path("public/images/game-board.svg"),
        help="Board SVG containing the embedded PNG.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("public/data/board-zones.geojson"),
        help="GeoJSON output path.",
    )
    parser.add_argument(
        "--preview",
        type=Path,
        help="Optional PNG preview with generated outlines drawn over the board.",
    )
    parser.add_argument(
        "--territories-output-dir",
        type=Path,
        default=Path("src/app/territories"),
        help="Directory for generated TypeScript territory metadata files.",
    )
    return parser.parse_args()


def extract_embedded_png(svg_path: Path) -> Image.Image:
    svg = svg_path.read_text(encoding="utf-8", errors="ignore")
    match = re.search(r"base64,([^\"']+)", svg, re.S)

    if not match:
        raise ValueError(f"No embedded base64 image found in {svg_path}")

    png_bytes = base64.b64decode(re.sub(r"\s+", "", match.group(1)))
    return Image.open(io.BytesIO(png_bytes)).convert("RGB")


def dilate(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()

    for _ in range(radius):
        padded = np.pad(out, 1, constant_values=False)
        out = (
            padded[1:-1, 1:-1]
            | padded[:-2, 1:-1]
            | padded[2:, 1:-1]
            | padded[1:-1, :-2]
            | padded[1:-1, 2:]
            | padded[:-2, :-2]
            | padded[:-2, 2:]
            | padded[2:, :-2]
            | padded[2:, 2:]
        )

    return out


def erode(mask: np.ndarray, radius: int) -> np.ndarray:
    out = mask.copy()

    for _ in range(radius):
        padded = np.pad(out, 1, constant_values=False)
        out = (
            padded[1:-1, 1:-1]
            & padded[:-2, 1:-1]
            & padded[2:, 1:-1]
            & padded[1:-1, :-2]
            & padded[1:-1, 2:]
            & padded[:-2, :-2]
            & padded[:-2, 2:]
            & padded[2:, :-2]
            & padded[2:, 2:]
        )

    return out


def close_mask(mask: np.ndarray, radius: int) -> np.ndarray:
    return erode(dilate(mask, radius), radius)


def remove_lines(mask: np.ndarray, lines: list[tuple[tuple[int, int], tuple[int, int]]], width: int) -> np.ndarray:
    barrier_image = Image.new("1", (mask.shape[1], mask.shape[0]), 0)
    draw = ImageDraw.Draw(barrier_image)

    for start, end in lines:
        draw.line([start, end], fill=1, width=width)

    return mask & ~np.array(barrier_image, dtype=bool)


def row_runs(row: np.ndarray) -> list[tuple[int, int]]:
    xs = np.flatnonzero(row)

    if xs.size == 0:
        return []

    breaks = np.where(np.diff(xs) > 1)[0]
    starts = np.r_[0, breaks + 1]
    ends = np.r_[breaks, xs.size - 1]

    return [(int(xs[start]), int(xs[end])) for start, end in zip(starts, ends)]


def components(mask: np.ndarray) -> list[dict[str, Any]]:
    labels = DisjointSet()
    previous_row: list[tuple[int, int, int]] = []
    records: list[tuple[int, int, int, int]] = []

    for y in range(mask.shape[0]):
        current_row = []

        for x0, x1 in row_runs(mask[y]):
            label = labels.make(x0, x1, y)
            records.append((y, x0, x1, label))

            for previous_x0, previous_x1, previous_label in previous_row:
                if previous_x1 < x0:
                    continue
                if previous_x0 > x1:
                    break
                labels.union(label, previous_label)

            current_row.append((x0, x1, label))

        previous_row = current_row

    grouped_runs: dict[int, list[tuple[int, int, int]]] = defaultdict(list)

    for y, x0, x1, label in records:
        grouped_runs[labels.find(label)].append((y, x0, x1))

    result = []

    for root, runs in grouped_runs.items():
        area = labels.area[root]
        result.append(
            {
                "area": area,
                "bbox": labels.bbox[root - 1],
                "centroid": (labels.sum_x[root] / area, labels.sum_y[root] / area),
                "runs": runs,
            }
        )

    return result


def signed_area(points: list[tuple[float, float]]) -> float:
    total = 0.0

    for (x1, y1), (x2, y2) in zip(points, points[1:]):
        total += x1 * y2 - x2 * y1

    return total / 2


def remove_collinear(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    if len(points) <= 4:
        return points

    open_ring = points[:-1]
    result = []

    for index, point in enumerate(open_ring):
        previous_point = open_ring[index - 1]
        next_point = open_ring[(index + 1) % len(open_ring)]

        if (
            previous_point[0] == point[0] == next_point[0]
            or previous_point[1] == point[1] == next_point[1]
        ):
            continue

        result.append(point)

    if result and result[0] != result[-1]:
        result.append(result[0])

    return result


def perpendicular_distance(
    point: tuple[int, int], start: tuple[int, int], end: tuple[int, int]
) -> float:
    start_x, start_y = start
    end_x, end_y = end
    point_x, point_y = point
    delta_x = end_x - start_x
    delta_y = end_y - start_y

    if delta_x == 0 and delta_y == 0:
        return math.hypot(point_x - start_x, point_y - start_y)

    return abs(delta_y * point_x - delta_x * point_y + end_x * start_y - end_y * start_x) / math.hypot(
        delta_x, delta_y
    )


def rdp(points: list[tuple[int, int]], epsilon: float) -> list[tuple[int, int]]:
    if len(points) <= 2:
        return points

    start = points[0]
    end = points[-1]
    max_distance = -1.0
    max_index = -1

    for index in range(1, len(points) - 1):
        distance = perpendicular_distance(points[index], start, end)

        if distance > max_distance:
            max_distance = distance
            max_index = index

    if max_distance > epsilon:
        left = rdp(points[: max_index + 1], epsilon)
        right = rdp(points[max_index:], epsilon)
        return left[:-1] + right

    return [start, end]


def simplify_ring(points: list[tuple[int, int]], epsilon: float = 2.0) -> list[tuple[int, int]]:
    points = remove_collinear(points)
    open_ring = points[:-1]

    if len(open_ring) < 8:
        return points

    first_index = min(range(len(open_ring)), key=lambda index: (open_ring[index][0], open_ring[index][1]))
    open_ring = open_ring[first_index:] + open_ring[:first_index]
    middle = len(open_ring) // 2
    first_half = rdp(open_ring[: middle + 1], epsilon)
    second_half = rdp(open_ring[middle:] + [open_ring[0]], epsilon)
    result = first_half[:-1] + second_half

    if result[0] != result[-1]:
        result.append(result[0])

    return remove_collinear(result)


def convex_hull(points: list[tuple[int, int]]) -> list[tuple[int, int]]:
    unique_points = sorted(set(points))

    if len(unique_points) <= 1:
        return unique_points

    def cross(
        origin: tuple[int, int],
        left: tuple[int, int],
        right: tuple[int, int],
    ) -> int:
        return (left[0] - origin[0]) * (right[1] - origin[1]) - (left[1] - origin[1]) * (right[0] - origin[0])

    lower: list[tuple[int, int]] = []
    for point in unique_points:
        while len(lower) >= 2 and cross(lower[-2], lower[-1], point) <= 0:
            lower.pop()
        lower.append(point)

    upper: list[tuple[int, int]] = []
    for point in reversed(unique_points):
        while len(upper) >= 2 and cross(upper[-2], upper[-1], point) <= 0:
            upper.pop()
        upper.append(point)

    return lower[:-1] + upper[:-1]


def to_geojson_ring(ring: list[tuple[int, int]]) -> list[list[float]]:
    return [[round(float(x), 2), round(float(IMAGE_HEIGHT - y), 2)] for x, y in ring]


def hull_polygon(component: dict[str, Any], padding: int = 0) -> list[list[list[list[float]]]]:
    points = []

    for y, run_x0, run_x1 in component["runs"]:
        points.extend(
            [
                (run_x0 - padding, y - padding),
                (run_x1 + 1 + padding, y - padding),
                (run_x0 - padding, y + 1 + padding),
                (run_x1 + 1 + padding, y + 1 + padding),
            ]
        )

    hull = convex_hull(points)

    if len(hull) < 3:
        return []

    if hull[0] != hull[-1]:
        hull.append(hull[0])

    if signed_area(hull) < 0:
        hull = list(reversed(hull))

    return [[to_geojson_ring(simplify_ring(hull, LAND_SIMPLIFICATION_EPSILON))]]


def manual_polygons(config: dict[str, Any]) -> list[list[list[list[float]]]]:
    polygons = []

    for ring in config.get("manual_polygons", []):
        closed_ring = list(ring)

        if closed_ring and closed_ring[0] != closed_ring[-1]:
            closed_ring.append(closed_ring[0])

        polygons.append([to_geojson_ring(closed_ring)])

    return polygons


def contour_polygons(
    component: dict[str, Any],
    epsilon: float = 2.0,
    hole_min_area: int = 2500,
    expansion_radius: int = 0,
    close_radius: int = 0,
) -> list[list[list[list[float]]]]:
    x0, y0, x1, y1 = component["bbox"]
    margin = expansion_radius + close_radius + 3
    width = x1 - x0 + 1 + margin * 2
    height = y1 - y0 + 1 + margin * 2
    mask = np.zeros((height, width), dtype=bool)

    for y, run_x0, run_x1 in component["runs"]:
        mask[
            y - y0 + margin,
            run_x0 - x0 + margin : run_x1 - x0 + margin + 1,
        ] = True

    if close_radius:
        mask = close_mask(mask, close_radius)

    if expansion_radius:
        mask = dilate(mask, expansion_radius)

    up = np.zeros_like(mask)
    up[1:, :] = mask[:-1, :]
    down = np.zeros_like(mask)
    down[:-1, :] = mask[1:, :]
    left = np.zeros_like(mask)
    left[:, 1:] = mask[:, :-1]
    right = np.zeros_like(mask)
    right[:, :-1] = mask[:, 1:]

    starts: dict[tuple[int, int], list[tuple[int, int]]] = defaultdict(list)
    edge_count = 0

    def add_edge(start: tuple[int, int], end: tuple[int, int]) -> None:
        nonlocal edge_count
        starts[start].append(end)
        edge_count += 1

    ys, xs = np.where(mask & ~up)
    for y, x in zip(ys, xs):
        add_edge((x0 + x - margin, y0 + y - margin), (x0 + x - margin + 1, y0 + y - margin))

    ys, xs = np.where(mask & ~right)
    for y, x in zip(ys, xs):
        add_edge((x0 + x - margin + 1, y0 + y - margin), (x0 + x - margin + 1, y0 + y - margin + 1))

    ys, xs = np.where(mask & ~down)
    for y, x in zip(ys, xs):
        add_edge((x0 + x - margin + 1, y0 + y - margin + 1), (x0 + x - margin, y0 + y - margin + 1))

    ys, xs = np.where(mask & ~left)
    for y, x in zip(ys, xs):
        add_edge((x0 + x - margin, y0 + y - margin + 1), (x0 + x - margin, y0 + y - margin))

    loops = []

    while edge_count:
        start = next(key for key, values in starts.items() if values)
        point = start
        loop = [point]

        while True:
            if not starts.get(point):
                break

            next_point = starts[point].pop()
            edge_count -= 1

            if not starts[point]:
                del starts[point]

            loop.append(next_point)
            point = next_point

            if point == start:
                break

        if len(loop) > 3 and loop[0] == loop[-1]:
            simplified_loop = simplify_ring(loop, epsilon)
            area = signed_area(simplified_loop)

            if abs(area) > 20:
                loops.append((area, simplified_loop))

    if not loops:
        return []

    outer_rings = [(abs(area), ring) for area, ring in loops if area > 0]
    hole_rings = [(abs(area), ring) for area, ring in loops if area < 0 and abs(area) >= hole_min_area]

    if not outer_rings:
        outer_rings = [max(((abs(area), ring) for area, ring in loops), key=lambda item: item[0])]

    polygons = []

    for _, outer in sorted(outer_rings, reverse=True):
        polygons.append([to_geojson_ring(outer)])

    if hole_rings and polygons:
        # Large holes are land/island areas inside sea polygons. Small text holes are ignored.
        for _, hole in hole_rings:
            polygons[0].append(to_geojson_ring(hole))

    return polygons


def bbox_inside(bbox: list[int], rect: tuple[int, int, int, int]) -> bool:
    x0, y0, x1, y1 = bbox
    rect_x0, rect_y0, rect_x1, rect_y1 = rect
    return x0 >= rect_x0 and y0 >= rect_y0 and x1 <= rect_x1 and y1 <= rect_y1


def point_inside_rect(point: tuple[float, float], rect: tuple[int, int, int, int]) -> bool:
    x, y = point
    rect_x0, rect_y0, rect_x1, rect_y1 = rect
    return rect_x0 <= x <= rect_x1 and rect_y0 <= y <= rect_y1


def geojson_polygons(geometry: dict[str, Any]) -> list[list[list[list[float]]]]:
    return [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]


def geojson_ring_area(ring: list[list[float]]) -> float:
    area = 0.0

    for index, point in enumerate(ring):
        next_point = ring[(index + 1) % len(ring)]
        area += point[0] * next_point[1] - next_point[0] * point[1]

    return area / 2


def geojson_ring_centroid(ring: list[list[float]]) -> tuple[float, float]:
    points = ring[:-1] if len(ring) > 1 and ring[0] == ring[-1] else ring
    area_factor = 0.0
    centroid_x = 0.0
    centroid_y = 0.0

    for index, point in enumerate(points):
        next_point = points[(index + 1) % len(points)]
        cross_product = point[0] * next_point[1] - next_point[0] * point[1]
        area_factor += cross_product
        centroid_x += (point[0] + next_point[0]) * cross_product
        centroid_y += (point[1] + next_point[1]) * cross_product

    if abs(area_factor) < 0.001:
        return (
            sum(point[0] for point in points) / len(points),
            sum(point[1] for point in points) / len(points),
        )

    return centroid_x / (3 * area_factor), centroid_y / (3 * area_factor)


def point_inside_ring(point: tuple[float, float], ring: list[list[float]]) -> bool:
    x, y = point
    inside = False
    previous = ring[-1]

    for current in ring:
        current_x, current_y = current
        previous_x, previous_y = previous
        crosses_y = (current_y > y) != (previous_y > y)

        if crosses_y:
            intersection_x = (previous_x - current_x) * (y - current_y) / (previous_y - current_y) + current_x
            if x < intersection_x:
                inside = not inside

        previous = current

    return inside


def point_inside_geojson_polygon(point: tuple[float, float], polygon: list[list[list[float]]]) -> bool:
    return point_inside_ring(point, polygon[0]) and not any(
        point_inside_ring(point, hole) for hole in polygon[1:]
    )


def mask_from_components(components_to_mask: list[dict[str, Any]], shape: tuple[int, int]) -> np.ndarray:
    mask = np.zeros(shape, dtype=bool)

    for component in components_to_mask:
        for y, run_x0, run_x1 in component["runs"]:
            mask[y, run_x0 : run_x1 + 1] = True

    return mask


def polygon_inside_geojson_polygon(
    candidate_polygon: list[list[list[float]]],
    container_polygon: list[list[list[float]]],
) -> bool:
    outer_ring = candidate_polygon[0]
    if not point_inside_geojson_polygon(geojson_ring_centroid(outer_ring), container_polygon):
        return False

    return all(point_inside_geojson_polygon((point[0], point[1]), container_polygon) for point in outer_ring[:-1])


def feature_inside_feature(candidate: dict[str, Any], container: dict[str, Any]) -> bool:
    container_polygons = geojson_polygons(container["geometry"])

    return all(
        any(polygon_inside_geojson_polygon(candidate_polygon, container_polygon) for container_polygon in container_polygons)
        for candidate_polygon in geojson_polygons(candidate["geometry"])
    )


def land_containing_sea_ids(features: list[dict[str, Any]]) -> dict[str, str]:
    sea_features = [feature for feature in features if feature["properties"]["kind"] == "sea"]
    result = {}

    for land_feature in (feature for feature in features if feature["properties"]["kind"] == "land"):
        containers = [
            sea_feature["properties"]["id"]
            for sea_feature in sea_features
            if feature_inside_feature(land_feature, sea_feature)
        ]

        if len(containers) == 1:
            result[land_feature["properties"]["id"]] = containers[0]

    return result


def feature_has_opposite_border(
    feature: dict[str, Any],
    feature_masks: dict[str, np.ndarray],
    land_mask: np.ndarray,
    sea_mask: np.ndarray,
    neutral_mask: np.ndarray,
) -> bool:
    feature_id = feature["properties"]["id"]
    feature_kind = feature["properties"]["kind"]
    opposite_mask = sea_mask if feature_kind == "land" else land_mask
    search_mask = dilate(feature_masks[feature_id], COASTAL_ADJACENCY_RADIUS)
    neutral_clearance = ~dilate(neutral_mask, COASTAL_ADJACENCY_RADIUS)

    return bool(np.any(search_mask & opposite_mask & neutral_clearance))


def add_zone_subkinds(
    features: list[dict[str, Any]],
    feature_masks: dict[str, np.ndarray],
    neutral_mask: np.ndarray,
) -> None:
    land_mask = np.zeros_like(neutral_mask)
    sea_mask = np.zeros_like(neutral_mask)

    for feature in features:
        feature_id = feature["properties"]["id"]
        if feature["properties"]["kind"] == "land":
            land_mask |= feature_masks[feature_id]
        else:
            sea_mask |= feature_masks[feature_id]

    contained_land_by_sea = land_containing_sea_ids(features)
    island_sea_ids = set(contained_land_by_sea.values())

    for feature in features:
        properties = feature["properties"]
        feature_id = properties["id"]

        if feature_id in contained_land_by_sea or feature_id in island_sea_ids:
            properties["subKind"] = "island"
        elif feature_has_opposite_border(feature, feature_masks, land_mask, sea_mask, neutral_mask):
            properties["subKind"] = "coastal"
        else:
            properties["subKind"] = "interior"


def orient_hole_for_polygon(
    hole: list[list[float]],
    polygon: list[list[list[float]]],
) -> list[list[float]]:
    if geojson_ring_area(hole) * geojson_ring_area(polygon[0]) > 0:
        return list(reversed(hole))

    return hole


def add_land_holes_to_target_sea_zones(features: list[dict[str, Any]]) -> None:
    land_rings = [
        {
            "name": feature["properties"]["name"],
            "ring": polygon[0],
            "centroid": geojson_ring_centroid(polygon[0]),
        }
        for feature in features
        if feature["properties"]["kind"] == "land"
        for polygon in geojson_polygons(feature["geometry"])
        if polygon
    ]

    for sea_feature in features:
        properties = sea_feature["properties"]
        if (
            properties["kind"] != "sea"
            or properties["boardNumber"] not in SEA_ZONE_ISLAND_HOLE_BOARD_NUMBERS
        ):
            continue

        for sea_polygon in geojson_polygons(sea_feature["geometry"]):
            for land_ring in land_rings:
                if not point_inside_geojson_polygon(land_ring["centroid"], sea_polygon):
                    continue

                sea_polygon.append(orient_hole_for_polygon(land_ring["ring"], sea_polygon))


def expanded_bbox(bbox: list[int], radius: int, shape: tuple[int, int]) -> tuple[int, int, int, int]:
    height, width = shape

    return (
        max(0, bbox[0] - radius),
        max(0, bbox[1] - radius),
        min(width - 1, bbox[2] + radius),
        min(height - 1, bbox[3] + radius),
    )


def bboxes_overlap(left: tuple[int, int, int, int], right: tuple[int, int, int, int]) -> bool:
    return left[0] <= right[2] and right[0] <= left[2] and left[1] <= right[3] and right[1] <= left[3]


def bbox_slice(bbox: tuple[int, int, int, int]) -> tuple[slice, slice]:
    return slice(bbox[1], bbox[3] + 1), slice(bbox[0], bbox[2] + 1)


def masks_are_adjacent(
    left_mask: np.ndarray,
    right_mask: np.ndarray,
    left_bbox: list[int],
    right_bbox: list[int],
    selectable_mask: np.ndarray,
    neutral_blocker: np.ndarray,
) -> bool:
    shape = neutral_blocker.shape
    left_expanded_bbox = expanded_bbox(left_bbox, TERRITORY_ADJACENCY_RADIUS, shape)
    right_expanded_bbox = expanded_bbox(right_bbox, TERRITORY_ADJACENCY_RADIUS, shape)

    if not bboxes_overlap(left_expanded_bbox, right_expanded_bbox):
        return False

    search_bbox = (
        max(0, min(left_bbox[0], right_bbox[0]) - TERRITORY_ADJACENCY_RADIUS),
        max(0, min(left_bbox[1], right_bbox[1]) - TERRITORY_ADJACENCY_RADIUS),
        min(shape[1] - 1, max(left_bbox[2], right_bbox[2]) + TERRITORY_ADJACENCY_RADIUS),
        min(shape[0] - 1, max(left_bbox[3], right_bbox[3]) + TERRITORY_ADJACENCY_RADIUS),
    )
    slices = bbox_slice(search_bbox)
    left_search_mask = left_mask[slices]
    right_search_mask = right_mask[slices]
    allowed_mask = (
        (~selectable_mask[slices] & ~neutral_blocker[slices])
        | left_search_mask
        | right_search_mask
    )
    expanded_mask = left_search_mask.copy()

    for _ in range(TERRITORY_ADJACENCY_RADIUS):
        expanded_mask = dilate(expanded_mask, 1) & allowed_mask
        if np.any(expanded_mask & right_search_mask):
            return True

    return False


def build_adjacency_by_name(
    features: list[dict[str, Any]],
    feature_masks: dict[str, np.ndarray],
    feature_bboxes: dict[str, list[int]],
    neutral_mask: np.ndarray,
) -> dict[str, set[str]]:
    selectable_features = [feature for feature in features if feature["properties"].get("selectable")]
    adjacency_by_name = {feature["properties"]["name"]: set() for feature in selectable_features}
    neutral_blocker = dilate(neutral_mask, TERRITORY_ADJACENCY_RADIUS)
    selectable_mask = np.zeros_like(neutral_mask)

    for feature in selectable_features:
        selectable_mask |= feature_masks[feature["properties"]["id"]]

    for left_index, left_feature in enumerate(selectable_features):
        left_id = left_feature["properties"]["id"]
        left_name = left_feature["properties"]["name"]

        for right_feature in selectable_features[left_index + 1 :]:
            right_id = right_feature["properties"]["id"]
            if not masks_are_adjacent(
                feature_masks[left_id],
                feature_masks[right_id],
                feature_bboxes[left_id],
                feature_bboxes[right_id],
                selectable_mask,
                neutral_blocker,
            ):
                continue

            right_name = right_feature["properties"]["name"]
            adjacency_by_name[left_name].add(right_name)
            adjacency_by_name[right_name].add(left_name)

    for left_name, right_name in MANUAL_TERRITORY_ADJACENCIES:
        if left_name not in adjacency_by_name:
            raise ValueError(f"Manual adjacency references unknown territory: {left_name}")
        if right_name not in adjacency_by_name:
            raise ValueError(f"Manual adjacency references unknown territory: {right_name}")

        adjacency_by_name[left_name].add(right_name)
        adjacency_by_name[right_name].add(left_name)

    for adjacency in SPECIAL_ADJACENCIES:
        left_name = adjacency["from"]
        right_name = adjacency["to"]
        required_territories = adjacency["requiredTerritories"]

        if left_name not in adjacency_by_name:
            raise ValueError(f"Special adjacency references unknown territory: {left_name}")
        if right_name not in adjacency_by_name:
            raise ValueError(f"Special adjacency references unknown territory: {right_name}")
        for territory_name in required_territories:
            if territory_name not in adjacency_by_name:
                raise ValueError(f"Special adjacency references unknown territory: {territory_name}")
        if right_name not in adjacency_by_name[left_name]:
            raise ValueError(f"Special adjacency is not adjacent: {left_name} / {right_name}")

    return adjacency_by_name


def build_territory_outputs(
    features: list[dict[str, Any]],
    feature_masks: dict[str, np.ndarray],
    feature_bboxes: dict[str, list[int]],
    neutral_mask: np.ndarray,
) -> tuple[dict[str, set[str]], list[dict[str, Any]]]:
    adjacency_by_name = build_adjacency_by_name(features, feature_masks, feature_bboxes, neutral_mask)

    return adjacency_by_name, SPECIAL_ADJACENCIES


def format_typescript_string(value: str) -> str:
    return json.dumps(value)


def format_const_array(name: str, values: list[str]) -> list[str]:
    lines = [f"export const {name} = ["]
    lines.extend(f"  {format_typescript_string(value)}," for value in values)
    lines.append("] as const;")

    return lines


def format_territory_names_typescript(features: list[dict[str, Any]]) -> str:
    land_names = sorted(
        feature["properties"]["name"]
        for feature in features
        if feature["properties"].get("kind") == "land"
    )
    sea_names = sorted(
        feature["properties"]["name"]
        for feature in features
        if feature["properties"].get("kind") == "sea"
    )

    territory_names = sorted(land_names + sea_names)
    lines = [
        *format_const_array("LAND_TERRITORY_NAMES", land_names),
        "",
        *format_const_array("SEA_TERRITORY_NAMES", sea_names),
        "",
        *format_const_array("TERRITORY_NAMES", territory_names),
        "",
        "export type LandTerritoryName = (typeof LAND_TERRITORY_NAMES)[number];",
        "export type SeaTerritoryName = (typeof SEA_TERRITORY_NAMES)[number];",
        "export type TerritoryName = (typeof TERRITORY_NAMES)[number];",
        "",
    ]

    return "\n".join(lines)


def format_territory_info_typescript(features: list[dict[str, Any]]) -> str:
    lines = [
        "import type { TerritoryName } from './territory-names';",
        "",
        "export type TerritoryKind = 'land' | 'sea';",
        "export type TerritorySubKind = 'coastal' | 'interior' | 'island';",
        "",
        "export interface TerritoryInfo {",
        "  readonly kind: TerritoryKind;",
        "  readonly subKind: TerritorySubKind;",
        "}",
        "",
        "export const TERRITORY_INFO_BY_NAME: Record<TerritoryName, TerritoryInfo> = {",
    ]

    for feature in sorted(features, key=lambda item: item["properties"]["name"]):
        properties = feature["properties"]
        name = properties["name"]
        kind = properties["kind"]
        sub_kind = properties["subKind"]
        lines.append(
            f"  {format_typescript_string(name)}: "
            f"{{ kind: {format_typescript_string(kind)}, subKind: {format_typescript_string(sub_kind)} }},"
        )

    lines.extend([
        "};",
        "",
    ])

    return "\n".join(lines)


def special_adjacency_key(left_name: str, right_name: str) -> str:
    return "|".join(sorted([left_name, right_name]))


def format_territory_adjacency_typescript(
    adjacency_by_name: dict[str, set[str]],
    special_adjacencies: list[dict[str, Any]],
) -> str:
    lines = [
        "import type { TerritoryName } from './territory-names';",
        "",
        "export type SpecialAdjacencyKind = 'canal';",
        "",
        "export interface SpecialAdjacency {",
        "  readonly kind: SpecialAdjacencyKind;",
        "  readonly territories: readonly [TerritoryName, TerritoryName];",
        "  readonly requiredTerritories: readonly TerritoryName[];",
        "}",
        "",
        "export const ADJACENT_TERRITORIES_BY_NAME: Record<TerritoryName, readonly TerritoryName[]> = {",
    ]

    for name in sorted(adjacency_by_name):
        neighbors = ", ".join(format_typescript_string(neighbor) for neighbor in sorted(adjacency_by_name[name]))
        lines.append(f"  {format_typescript_string(name)}: [{neighbors}],")

    lines.extend([
        "};",
        "",
        "export const SPECIAL_ADJACENCIES: Record<string, SpecialAdjacency> = {",
    ])

    for adjacency in sorted(special_adjacencies, key=lambda item: special_adjacency_key(item["from"], item["to"])):
        left_name = adjacency["from"]
        right_name = adjacency["to"]
        key = special_adjacency_key(left_name, right_name)
        required_territories = ", ".join(
            format_typescript_string(name) for name in sorted(adjacency["requiredTerritories"])
        )
        lines.append(
            f"  {format_typescript_string(key)}: "
            f"{{ kind: {format_typescript_string(adjacency['kind'])}, "
            f"territories: [{format_typescript_string(left_name)}, {format_typescript_string(right_name)}], "
            f"requiredTerritories: [{required_territories}] }},"
        )

    lines.extend([
        "};",
        "",
    ])

    return "\n".join(lines)


def geojson_feature_without_runtime_metadata(feature: dict[str, Any]) -> dict[str, Any]:
    next_feature = {
        **feature,
        "properties": {
            key: value
            for key, value in feature["properties"].items()
            if key not in {"kind", "subKind"}
        },
    }

    return next_feature


def write_text_lf(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)

    with path.open("w", encoding="utf-8", newline="\n") as output:
        output.write(content)


def format_generated_files(paths: list[Path]) -> None:
    repo_root = Path(__file__).resolve().parents[1]
    prettier = repo_root / "node_modules" / ".bin" / "prettier"

    if not prettier.exists():
        raise FileNotFoundError("Prettier is not installed. Run npm install before generating board zone files.")

    subprocess.run(
        [
            prettier.as_posix(),
            "--write",
            "--ignore-unknown",
            "--config",
            (repo_root / "package.json").as_posix(),
            *(path.resolve().as_posix() for path in paths),
        ],
        cwd=repo_root,
        check=True,
    )


def land_merge_index(component: dict[str, Any], color_name: str) -> int | None:
    for index, config in enumerate(LAND_MERGE_RECTS):
        if config["color"] != color_name:
            continue
        if component["area"] < config.get("min_area", LAND_MANUAL_MIN_AREA):
            continue
        if point_inside_rect(component["centroid"], config["rect"]):
            return index

    return None


def circle_runs(center_x: int, center_y: int, radius: int) -> list[tuple[int, int, int]]:
    runs = []

    for y in range(center_y - radius, center_y + radius + 1):
        delta_y = y - center_y
        half_width = int(math.sqrt(max(0, radius * radius - delta_y * delta_y)))
        runs.append((y, center_x - half_width, center_x + half_width))

    return runs


def component_from_runs(runs: list[tuple[int, int, int]], terrain_color: str) -> dict[str, Any]:
    area = sum(run_x1 - run_x0 + 1 for _, run_x0, run_x1 in runs)
    centroid_x = sum((run_x0 + run_x1) * (run_x1 - run_x0 + 1) / 2 for _, run_x0, run_x1 in runs) / area
    centroid_y = sum(y * (run_x1 - run_x0 + 1) for y, run_x0, run_x1 in runs) / area
    bbox = [
        min(run_x0 for _, run_x0, _ in runs),
        min(y for y, _, _ in runs),
        max(run_x1 for _, _, run_x1 in runs),
        max(y for y, _, _ in runs),
    ]

    return {
        "area": area,
        "bbox": bbox,
        "centroid": (centroid_x, centroid_y),
        "runs": runs,
        "terrainColor": terrain_color,
    }


def extra_circle_components(config: dict[str, Any], terrain_color: str) -> list[dict[str, Any]]:
    return [
        component_from_runs(circle_runs(center_x, center_y, radius), terrain_color)
        for center_x, center_y, radius in config.get("extra_circles", [])
    ]


def combine_components(group: list[dict[str, Any]], config: dict[str, Any] | None = None) -> dict[str, Any]:
    runs = []

    for component in group:
        runs.extend(component["runs"])

    if config:
        for component in extra_circle_components(config, group[0]["terrainColor"]):
            runs.extend(component["runs"])

    return component_from_runs(runs, group[0]["terrainColor"])


def make_masks(image: Image.Image) -> tuple[dict[str, np.ndarray], np.ndarray, np.ndarray]:
    pixels = np.array(image).astype(np.int32)
    colors = np.array([color for _, color, _ in PALETTE], dtype=np.int32)
    distances = ((pixels[:, :, None, :] - colors[None, None, :, :]) ** 2).sum(axis=3)
    nearest = distances.argmin(axis=2)
    minimum_distances = distances.min(axis=2)
    palette_name_to_index = {name: index for index, (name, _, _) in enumerate(PALETTE)}

    land_color_masks = {}

    for color_name in SELECTABLE_LAND_COLORS:
        index = palette_name_to_index[color_name]
        land_color_masks[color_name] = distances[:, :, index] <= LAND_SEED_THRESHOLD * LAND_SEED_THRESHOLD

    sea_index = palette_name_to_index["sea"]
    sea_threshold = PALETTE[sea_index][2]
    sea_mask = (nearest == sea_index) & (minimum_distances <= sea_threshold * sea_threshold)

    neutral_index = palette_name_to_index[NEUTRAL_LAND_COLOR]
    neutral_mask = distances[:, :, neutral_index] <= LAND_SEED_THRESHOLD * LAND_SEED_THRESHOLD

    return land_color_masks, sea_mask, neutral_mask


def build_geojson(
    image: Image.Image,
    source_image: Path,
) -> tuple[dict[str, Any], list[dict[str, Any]], dict[str, set[str]], list[dict[str, Any]]]:
    land_color_masks, sea_mask, neutral_mask = make_masks(image)
    sea_free = sea_mask & ~dilate(~sea_mask, SEA_SPLIT_EROSION_RADIUS)
    sea_free = remove_lines(sea_free, SEA_DIVIDER_LINES, width=7)

    land_groups: list[dict[str, Any]] = []
    land_merge_groups = [{"config": config, "components": []} for config in LAND_MERGE_RECTS]

    for color_name, color_mask in land_color_masks.items():
        for component in components(color_mask):
            component["terrainColor"] = color_name
            merge_index = land_merge_index(component, color_name)

            if merge_index is not None:
                land_merge_groups[merge_index]["components"].append(component)
            elif component["area"] > LAND_MIN_AREA:
                land_groups.append({"components": [component], "config": None})

    land_groups.extend(group for group in land_merge_groups if group["components"])

    for group in land_groups:
        group["component"] = combine_components(group["components"], group["config"])

    sea_components = [component for component in components(sea_free) if component["area"] > SEA_MIN_AREA]
    sea_components = [
        component
        for component in sea_components
        if not any(bbox_inside(component["bbox"], rect) for rect in INLAND_SEA_EXCLUSION_RECTS)
    ]

    sea_groups = []
    merge_groups = [[] for _ in SEA_MERGE_RECTS]
    panama_sliver = []

    for component in sea_components:
        bbox = component["bbox"]
        merge_index = next(
            (
                index
                for index, merge_rect in enumerate(SEA_MERGE_RECTS)
                if point_inside_rect(component["centroid"], merge_rect)
            ),
            None,
        )

        if bbox[0] < 90 and 730 <= bbox[1] <= 780 and component["area"] < 1000:
            panama_sliver.append(component)
        elif merge_index is not None:
            merge_groups[merge_index].append(component)
        else:
            sea_groups.append([component])

    sea_groups.extend(group for group in merge_groups if group)

    if panama_sliver:
        target = min(
            sea_groups,
            key=lambda group: (group[0]["centroid"][0] - 60) ** 2 + (group[0]["centroid"][1] - 850) ** 2,
        )
        target.extend(panama_sliver)

    features = []
    feature_masks = {}
    feature_bboxes = {}

    for index, group in enumerate(
        sorted(
            sea_groups,
            key=lambda group: (
                min(component["centroid"][1] for component in group) // 120,
                min(component["centroid"][0] for component in group),
            ),
        ),
        1,
    ):
        area = sum(component["area"] for component in group)
        centroid_x = sum(component["centroid"][0] * component["area"] for component in group) / area
        centroid_y = sum(component["centroid"][1] * component["area"] for component in group) / area
        polygons = []

        for component in group:
            polygons.extend(
                contour_polygons(
                    component,
                    epsilon=max(SEA_SIMPLIFICATION_EPSILON, min(6.0, math.sqrt(component["area"]) / 60)),
                    hole_min_area=5000,
                    expansion_radius=SEA_OUTLINE_EXPANSION_RADIUS,
                    close_radius=SEA_CLOSE_RADIUS,
                )
        )

        feature_id = f"sea-{index:03d}"
        board_number = SEA_ZONE_BOARD_NUMBERS[feature_id]
        feature_masks[feature_id] = mask_from_components(group, sea_mask.shape)
        feature_bboxes[feature_id] = [
            min(component["bbox"][0] for component in group),
            min(component["bbox"][1] for component in group),
            max(component["bbox"][2] for component in group),
            max(component["bbox"][3] for component in group),
        ]
        geometry = (
            {"type": "Polygon", "coordinates": polygons[0]}
            if len(polygons) == 1
            else {"type": "MultiPolygon", "coordinates": polygons}
        )
        features.append(
            {
                "type": "Feature",
                "id": feature_id,
                "properties": {
                    "id": feature_id,
                    "kind": "sea",
                    "subKind": "interior",
                    "name": f"Sea Zone {board_number}",
                    "boardNumber": board_number,
                    "selectable": True,
                    "source": "generated-from-game-board-svg",
                    "area": area,
                    "labelPoint": [round(centroid_x, 1), round(IMAGE_HEIGHT - centroid_y, 1)],
                },
                "geometry": geometry,
            }
        )

    for index, group in enumerate(
        sorted(
            land_groups,
            key=lambda group: (
                group["component"]["centroid"][1] // 120,
                group["component"]["centroid"][0],
            ),
        ),
        1,
    ):
        component = group["component"]
        config = group["config"]
        if config and config.get("shape") == "manual":
            polygons = manual_polygons(config)
        elif config and config.get("shape") == "hull":
            polygons = hull_polygon(component, padding=config.get("hull_padding", LAND_OUTLINE_EXPANSION_RADIUS))
        elif config and config.get("shape") == "blob":
            polygons = contour_polygons(
                component,
                epsilon=LAND_SIMPLIFICATION_EPSILON,
                hole_min_area=1_000_000,
                expansion_radius=config.get("blob_radius", LAND_OUTLINE_EXPANSION_RADIUS),
                close_radius=0,
            )
        elif config and config.get("shape") == "parts":
            polygons = []
            part_components = group["components"] + extra_circle_components(config, component["terrainColor"])

            for part_component in part_components:
                polygons.extend(
                    contour_polygons(
                        part_component,
                        epsilon=max(
                            LAND_SIMPLIFICATION_EPSILON,
                            min(LAND_MAX_SIMPLIFICATION_EPSILON, math.sqrt(part_component["area"]) / 65),
                        ),
                        hole_min_area=1_000_000,
                        expansion_radius=config.get("expansion_radius", LAND_OUTLINE_EXPANSION_RADIUS),
                        close_radius=config.get("close_radius", LAND_CLOSE_RADIUS),
                    )
                )
        else:
            polygons = contour_polygons(
                component,
                epsilon=max(
                    LAND_SIMPLIFICATION_EPSILON,
                    min(LAND_MAX_SIMPLIFICATION_EPSILON, math.sqrt(component["area"]) / 65),
                ),
                hole_min_area=1_000_000,
                expansion_radius=config.get("expansion_radius", LAND_OUTLINE_EXPANSION_RADIUS)
                if config
                else LAND_OUTLINE_EXPANSION_RADIUS,
                close_radius=config.get("close_radius", LAND_CLOSE_RADIUS) if config else LAND_CLOSE_RADIUS,
            )

        if not polygons:
            continue

        feature_id = f"land-{index:03d}"
        terrain_color = component["terrainColor"]
        feature_masks[feature_id] = mask_from_components([component], sea_mask.shape)
        feature_bboxes[feature_id] = component["bbox"]
        properties = {
            "id": feature_id,
            "kind": "land",
            "subKind": "interior",
            "name": LAND_ZONE_NAMES[feature_id],
            "terrainColor": terrain_color,
            "nationality": NATIONALITY_BY_TERRAIN_COLOR[terrain_color],
            "selectable": True,
            "source": "generated-from-game-board-svg",
            "area": component["area"],
            "labelPoint": [
                round(component["centroid"][0], 1),
                round(IMAGE_HEIGHT - component["centroid"][1], 1),
            ],
        }

        if config:
            properties["manualName"] = config["name"]

        geometry = (
            {"type": "Polygon", "coordinates": polygons[0]}
            if len(polygons) == 1
            else {"type": "MultiPolygon", "coordinates": polygons}
        )
        features.append(
            {
                "type": "Feature",
                "id": feature_id,
                "properties": properties,
                "geometry": geometry,
            }
        )

    add_zone_subkinds(features, feature_masks, neutral_mask)
    add_land_holes_to_target_sea_zones(features)

    geojson_features = [geojson_feature_without_runtime_metadata(feature) for feature in features]
    geojson = {
        "type": "FeatureCollection",
        "name": "game-board-zones",
        "properties": {
            "imageWidth": IMAGE_WIDTH,
            "imageHeight": IMAGE_HEIGHT,
            "coordinateOrigin": "bottom-left",
            "sourceImage": source_image.as_posix(),
            "notes": (
                "Generated mask contours for selectable territories and sea zones; "
                "territory kind metadata lives in src/app/territories/territory-info.ts; "
                "neutral light-gray territories are intentionally omitted."
            ),
        },
        "features": geojson_features,
    }
    adjacency_by_name, special_adjacencies = build_territory_outputs(
        features,
        feature_masks,
        feature_bboxes,
        neutral_mask,
    )

    return geojson, features, adjacency_by_name, special_adjacencies


def write_preview(image: Image.Image, geojson: dict[str, Any], preview_path: Path) -> None:
    preview = image.convert("RGBA")
    overlay = Image.new("RGBA", image.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    for feature in geojson["features"]:
        color = (255, 255, 0, 130) if feature["properties"]["id"].startswith("sea-") else (255, 0, 255, 150)
        geometry = feature["geometry"]
        polygons = [geometry["coordinates"]] if geometry["type"] == "Polygon" else geometry["coordinates"]

        for polygon in polygons:
            points = [(x, IMAGE_HEIGHT - y) for x, y in polygon[0]]

            if len(points) > 2:
                draw.line(points, fill=color, width=3)

    preview = Image.alpha_composite(preview, overlay)
    preview_path.parent.mkdir(parents=True, exist_ok=True)
    preview.save(preview_path)


def main() -> None:
    args = parse_args()
    image = extract_embedded_png(args.input)
    geojson, territory_features, adjacency_by_name, special_adjacencies = build_geojson(image, args.input)
    generated_files = [
        args.output,
        args.territories_output_dir / "territory-names.ts",
        args.territories_output_dir / "territory-info.ts",
        args.territories_output_dir / "territory-adjacency.ts",
    ]

    write_text_lf(args.output, json.dumps(geojson, indent=2) + "\n")

    write_text_lf(
        generated_files[1],
        format_territory_names_typescript(territory_features),
    )
    write_text_lf(
        generated_files[2],
        format_territory_info_typescript(territory_features),
    )
    write_text_lf(
        generated_files[3],
        format_territory_adjacency_typescript(adjacency_by_name, special_adjacencies),
    )

    if args.preview:
        write_preview(image, geojson, args.preview)

    format_generated_files(generated_files)

    sea_count = sum(1 for feature in territory_features if feature["properties"]["kind"] == "sea")
    land_count = sum(1 for feature in territory_features if feature["properties"]["kind"] == "land")
    print(f"Wrote {args.output.as_posix()} with {sea_count} sea zones and {land_count} land zones.")
    print(f"Wrote TypeScript territory files to {args.territories_output_dir.as_posix()}.")


if __name__ == "__main__":
    main()
