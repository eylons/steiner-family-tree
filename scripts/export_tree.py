#!/usr/bin/env python3
"""Export the chart cells, linework, and paired names from docs/tree.xlsx."""

import json
import re
import sys
from pathlib import Path
from zipfile import ZipFile
from xml.etree import ElementTree


NAMESPACE = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
CELL_REFERENCE = re.compile(r"([A-Z]+)(\d+)")
NAME_ROWS = ((2, 3), (6, 7), (15, 16), (16, 17), (25, 26), (41, 42), (50, 51), (60, 61), (67, 68), (69, 70))
COLUMN_WIDTH = 42
DEFAULT_ROW_HEIGHT = 21


def column_index(letters):
    result = 0
    for character in letters:
        result = result * 26 + ord(character) - ord("A") + 1
    return result


def cell_position(reference):
    match = CELL_REFERENCE.fullmatch(reference)
    if not match:
        raise ValueError("Unexpected cell reference: " + reference)
    return int(match.group(2)), column_index(match.group(1))


def read_cell_value(cell, shared_strings):
    kind = cell.attrib.get("t")
    if kind == "inlineStr":
        inline = cell.find("m:is", NAMESPACE)
        return "".join(node.text or "" for node in inline.findall(".//m:t", NAMESPACE)) if inline is not None else ""
    value = cell.find("m:v", NAMESPACE)
    if value is None or value.text is None:
        return ""
    if kind == "s":
        return shared_strings[int(value.text)]
    if kind == "str":
        return value.text
    return ""


def title_name(value):
    return " ".join(part[:1].upper() + part[1:] if part else "" for part in value.strip().split())


def export(source, destination):
    with ZipFile(source) as workbook:
        strings_xml = ElementTree.fromstring(workbook.read("xl/sharedStrings.xml"))
        shared_strings = [
            "".join(node.text or "" for node in item.findall(".//m:t", NAMESPACE))
            for item in strings_xml.findall("m:si", NAMESPACE)
        ]
        sheet = ElementTree.fromstring(workbook.read("xl/worksheets/sheet1.xml"))
        style_sheet = ElementTree.fromstring(workbook.read("xl/styles.xml"))
        cell_formats = style_sheet.find("m:cellXfs", NAMESPACE)
        border_definitions = style_sheet.find("m:borders", NAMESPACE)

    border_sides = []
    for border in border_definitions:
        sides = {}
        for side in border:
            name = side.tag.rsplit("}", 1)[-1]
            style = side.attrib.get("style")
            if name in ("left", "right", "top", "bottom") and style:
                sides[name] = style
        border_sides.append(sides)

    merge_widths = {}
    for merged in sheet.findall(".//m:mergeCell", NAMESPACE):
        start, end = merged.attrib["ref"].split(":")
        start_row, start_column = cell_position(start)
        _, end_column = cell_position(end)
        merge_widths[(start_row, start_column)] = end_column - start_column + 1

    rows = {}
    texts = {}
    cell_records = []
    for row in sheet.findall(".//m:sheetData/m:row", NAMESPACE):
        row_number = int(row.attrib["r"])
        rows[row_number] = float(row.attrib.get("ht", DEFAULT_ROW_HEIGHT))
        for cell in row.findall("m:c", NAMESPACE):
            row_index, column = cell_position(cell.attrib["r"])
            style_index = int(cell.attrib.get("s", "0"))
            border_index = int(cell_formats[style_index].attrib.get("borderId", "0"))
            value = read_cell_value(cell, shared_strings).strip()
            if value:
                texts[(row_index, column)] = value
            sides = border_sides[border_index] if border_index < len(border_sides) else {}
            if value or sides:
                cell_records.append((row_index, column, value, sides))

    row_limit = max((row for row, _ in texts), default=0)
    col_limit = max((column for _, column in texts), default=0)
    cell_records = [
        record for record in cell_records
        if record[0] <= row_limit and record[1] <= col_limit
    ]
    canvas_width = col_limit * COLUMN_WIDTH
    canvas_height = sum(rows.get(row_number, DEFAULT_ROW_HEIGHT) for row_number in range(1, row_limit + 1))
    row_offsets = {}
    offset = 0
    for row_number in range(1, row_limit + 1):
        row_offsets[row_number] = offset
        offset += rows.get(row_number, DEFAULT_ROW_HEIGHT)

    def y_at(row_number):
        return row_offsets[row_number]

    line_segments = {}

    def add_line(key, x1, y1, x2, y2, style):
        width = 2.4 if style == "double" else (1.8 if style in ("medium", "mediumDashDot", "mediumDashed") else 1.15)
        prior = line_segments.get(key)
        if prior is None or prior["width"] < width:
            line_segments[key] = {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "width": width}

    labels = []
    for row_number, column, value, sides in cell_records:
        x1 = (column - 1) * COLUMN_WIDTH
        x2 = column * COLUMN_WIDTH
        y1 = y_at(row_number)
        y2 = y1 + rows.get(row_number, DEFAULT_ROW_HEIGHT)
        for side, edge in sides.items():
            if side == "left":
                add_line(("v", x1, y1, y2), x1, y1, x1, y2, edge)
            elif side == "right":
                add_line(("v", x2, y1, y2), x2, y1, x2, y2, edge)
            elif side == "top":
                add_line(("h", y1, x1, x2), x1, y1, x2, y1, edge)
            elif side == "bottom":
                add_line(("h", y2, x1, x2), x1, y2, x2, y2, edge)
        if value:
            span = merge_widths.get((row_number, column), 1)
            labels.append({
                "row": row_number,
                "column": column,
                "text": value,
                "x": x1 + span * COLUMN_WIDTH / 2,
                "y": y1 + rows.get(row_number, DEFAULT_ROW_HEIGHT) / 2,
            })

    person_cells = set()
    people = []
    for first_row, last_row in NAME_ROWS:
        for (row_number, column), first_name in texts.items():
            if row_number != first_row:
                continue
            if (first_row, column) in person_cells:
                continue
            if not any(character.isalpha() for character in first_name):
                continue
            last_name = texts.get((last_row, column), "")
            person_cells.add((first_row, column))
            if last_name:
                person_cells.add((last_row, column))
            span = merge_widths.get((first_row, column), 1)
            full_name = title_name(first_name)
            if last_name:
                full_name += " " + title_name(last_name)
            line_height = min(
                rows.get(first_row, DEFAULT_ROW_HEIGHT),
                rows.get(last_row, DEFAULT_ROW_HEIGHT),
            )
            people.append({
                "id": str(first_row) + "-" + str(column),
                "name": full_name,
                "first_name": title_name(first_name),
                "last_name": title_name(last_name),
                "row": first_row,
                "last_name_row": last_row,
                "column": column,
                "x": (column - 1) * COLUMN_WIDTH,
                "y": y_at(first_row) + rows.get(first_row, DEFAULT_ROW_HEIGHT) / 2,
                "last_name_y": y_at(last_row) + rows.get(last_row, DEFAULT_ROW_HEIGHT) / 2,
                "width": span * COLUMN_WIDTH,
                "first_name_height": rows.get(first_row, DEFAULT_ROW_HEIGHT),
                "last_name_height": rows.get(last_row, DEFAULT_ROW_HEIGHT),
                "font_size": round(min(11, line_height * 0.72), 2),
            })

    labels = [
        label for label in labels
        if (label["row"], label["column"]) not in person_cells
    ]
    people.sort(key=lambda person: (person["row"], person["column"]))
    output = {
        "source": "Family chart spreadsheet · full tree",
        "width": canvas_width,
        "height": canvas_height,
        "people": people,
        "labels": labels,
        "lines": list(line_segments.values()),
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(output, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print("Exported {} people, {} chart labels, and {} line segments to {}".format(
        len(people), len(labels), len(line_segments), destination
    ))


if __name__ == "__main__":
    base = Path(__file__).resolve().parent.parent
    source_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else base / "docs" / "tree.xlsx"
    output_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else base / "data" / "tree.json"
    if not source_path.is_file():
        raise SystemExit("Source workbook not found: " + str(source_path))
    export(source_path, output_path)
