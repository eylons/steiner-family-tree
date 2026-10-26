#!/usr/bin/env python3
"""Export the additional legacy Steiner chart from its XLS workbook."""

import json
import re
import sys
from pathlib import Path

import xlrd


COLUMN_WIDTH = 42
DEFAULT_ROW_HEIGHT = 15
NAME_ROWS = ((5, 6), (14, 15), (19, 20), (25, 26), (28, 29))
LINE_WIDTHS = {1: 1.15, 2: 1.8, 3: 1.15, 4: 1.15, 5: 1.15, 6: 1.15, 7: 1.15, 8: 1.15, 9: 1.15, 10: 1.15, 11: 1.15, 12: 1.15, 13: 1.15}


def title_name(value):
    return " ".join(part[:1].upper() + part[1:] if part else "" for part in value.strip().split())


def row_height(sheet, row):
    info = sheet.rowinfo_map.get(row)
    return info.height / 20 * 4 / 3 if info and info.height else DEFAULT_ROW_HEIGHT * 4 / 3


def export(source, destination):
    workbook = xlrd.open_workbook(source, formatting_info=True, logfile=open("/dev/null", "w"))
    sheet = workbook.sheet_by_index(0)
    y_offsets = [0]
    for row in range(sheet.nrows):
        y_offsets.append(y_offsets[-1] + row_height(sheet, row))

    merge_widths = {}
    for row_start, _, column_start, column_end in sheet.merged_cells:
        merge_widths[(row_start, column_start)] = column_end - column_start

    text_cells = {}
    line_segments = {}

    def add_line(key, x1, y1, x2, y2, style):
        width = LINE_WIDTHS.get(style, 1.15)
        previous = line_segments.get(key)
        if previous is None or previous["width"] < width:
            line_segments[key] = {"x1": x1, "y1": y1, "x2": x2, "y2": y2, "width": width}

    for row in range(sheet.nrows):
        for column in range(sheet.ncols):
            cell = sheet.cell(row, column)
            if cell.ctype == xlrd.XL_CELL_EMPTY:
                value = ""
            else:
                value = str(cell.value).strip()
            if value:
                text_cells[(row, column)] = value

            border = workbook.xf_list[cell.xf_index].border
            x1 = column * COLUMN_WIDTH
            x2 = (column + 1) * COLUMN_WIDTH
            y1 = y_offsets[row]
            y2 = y_offsets[row + 1]
            if border.left_line_style:
                add_line(("v", x1, y1, y2), x1, y1, x1, y2, border.left_line_style)
            if border.right_line_style:
                add_line(("v", x2, y1, y2), x2, y1, x2, y2, border.right_line_style)
            if border.top_line_style:
                add_line(("h", y1, x1, x2), x1, y1, x2, y1, border.top_line_style)
            if border.bottom_line_style:
                add_line(("h", y2, x1, x2), x1, y2, x2, y2, border.bottom_line_style)

    people = []
    person_cells = set()
    for first_row, last_row in NAME_ROWS:
        for (row, column), first_name in text_cells.items():
            if row != first_row - 1 or not re.search(r"[^\W\d_]", first_name, re.UNICODE):
                continue
            last_name = text_cells.get((last_row - 1, column), "")
            span = merge_widths.get((row, column), 1)
            first_name = title_name(first_name)
            last_name = title_name(last_name)
            person_id = f"more-steiner-{first_row}-{column + 1}"
            person_cells.add((row, column))
            if last_name:
                person_cells.add((last_row - 1, column))
            line_height = min(row_height(sheet, row), row_height(sheet, last_row - 1))
            people.append({
                "id": person_id,
                "name": " ".join(part for part in (first_name, last_name) if part),
                "first_name": first_name,
                "last_name": last_name,
                "row": first_row,
                "last_name_row": last_row,
                "column": column + 1,
                "x": column * COLUMN_WIDTH,
                "y": y_offsets[row] + row_height(sheet, row) / 2,
                "last_name_y": y_offsets[last_row - 1] + row_height(sheet, last_row - 1) / 2,
                "width": span * COLUMN_WIDTH,
                "first_name_height": row_height(sheet, row),
                "last_name_height": row_height(sheet, last_row - 1),
                "font_size": round(min(11, line_height * 0.72), 2),
                "source_label": f"More Steiner chart · row {first_row}, column {column + 1}",
            })

    labels = []
    for (row, column), text in text_cells.items():
        if (row, column) in person_cells:
            continue
        span = merge_widths.get((row, column), 1)
        labels.append({
            "row": row + 1,
            "column": column + 1,
            "text": text,
            "x": (column + span / 2) * COLUMN_WIDTH,
            "y": (y_offsets[row] + y_offsets[row + 1]) / 2,
        })

    data = {
        "title": "Additional Steiner family chart",
        "description": "An additional family chart transcribed from the More Steiners workbook. Select a name to see its source location.",
        "summary": f"{len(people)} names transcribed from the additional Steiner chart",
        "source": "More Steiners workbook · first worksheet",
        "width": sheet.ncols * COLUMN_WIDTH,
        "height": y_offsets[-1],
        "people": sorted(people, key=lambda person: (person["row"], person["column"])),
        "labels": labels,
        "lines": list(line_segments.values()),
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Exported {len(people)} people and {len(line_segments)} chart lines to {destination}")


if __name__ == "__main__":
    project = Path(__file__).resolve().parent.parent
    source_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else project / "docs" / "more steiners.xls"
    destination_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else project / "data" / "more-steiners-tree.json"
    if not source_path.is_file():
        raise SystemExit("Source workbook not found: " + str(source_path))
    export(source_path, destination_path)
