#!/usr/bin/env python3
"""Export the numbered Steiner family list as a separate, source-preserving view."""

import json
import sys
from pathlib import Path

import xlrd


NODE_WIDTH = 150
UNIT_SPACING = 250
GENERATION_HEIGHT = 165


def split_name(value):
    parts = value.strip().split()
    if len(parts) < 2:
        return (parts[0] if parts else value, "")
    return " ".join(parts[:-1]), parts[-1]


def export(source, destination):
    workbook = xlrd.open_workbook(source, logfile=open("/dev/null", "w"))
    sheet = workbook.sheet_by_index(0)
    records = {}
    for row in range(3, sheet.nrows):
        code_value = sheet.cell_value(row, 0)
        name = str(sheet.cell_value(row, 1)).strip()
        partner = str(sheet.cell_value(row, 2)).strip()
        if not code_value or not name:
            continue
        code = str(int(code_value))
        records[code] = {
            "code": code,
            "name": name,
            "partner": partner,
            "source_row": row + 1,
            "children": [],
        }

    for code, record in records.items():
        parent_code = code[:-1]
        if parent_code in records:
            records[parent_code]["children"].append(code)
    for record in records.values():
        record["children"].sort()

    leaf_index = 0

    def assign_centers(code):
        nonlocal leaf_index
        record = records[code]
        if not record["children"]:
            center = 180 + leaf_index * UNIT_SPACING
            leaf_index += 1
        else:
            child_centers = [assign_centers(child) for child in record["children"]]
            center = (child_centers[0] + child_centers[-1]) / 2
        record["center"] = center
        return center

    root = next((code for code in records if code not in {child for item in records.values() for child in item["children"]}), None)
    if root is None:
        raise ValueError("The family list has no root record.")
    assign_centers(root)

    people = []
    relationship_lines = []
    labels = []
    for code, record in records.items():
        generation = len(code) - len(root)
        y = 76 + generation * GENERATION_HEIGHT
        person_center = record["center"] - (84 if record["partner"] else 0)
        first_name, last_name = split_name(record["name"])
        person_id = f"steiner-list-{code}"
        people.append({
            "id": person_id,
            "name": record["name"],
            "first_name": first_name,
            "last_name": last_name,
            "x": person_center - NODE_WIDTH / 2,
            "y": y,
            "last_name_y": y + 20,
            "width": NODE_WIDTH,
            "font_size": 13,
            "source_label": f"Steiner list workbook · row {record['source_row']} · record {code}",
        })

        if record["partner"]:
            partner_first, partner_last = split_name(record["partner"])
            partner_center = record["center"] + 84
            people.append({
                "id": f"{person_id}-partner",
                "name": record["partner"],
                "first_name": partner_first,
                "last_name": partner_last,
                "x": partner_center - NODE_WIDTH / 2,
                "y": y,
                "last_name_y": y + 20,
                "width": NODE_WIDTH,
                "font_size": 13,
                "source_label": f"Partner named in Steiner list workbook · row {record['source_row']}",
            })
            relationship_lines.append({
                "x1": record["center"] - 9,
                "y1": y + 35,
                "x2": record["center"] + 9,
                "y2": y + 35,
                "width": 1.8,
            })

        for child_code in record["children"]:
            child = records[child_code]
            parent_y = y + 48
            child_y = 76 + (len(child_code) - len(root)) * GENERATION_HEIGHT - 18
            relationship_lines.append({
                "x1": record["center"],
                "y1": parent_y,
                "x2": record["center"],
                "y2": (parent_y + child_y) / 2,
                "width": 1.15,
            })
            relationship_lines.append({
                "x1": record["center"],
                "y1": (parent_y + child_y) / 2,
                "x2": child["center"],
                "y2": (parent_y + child_y) / 2,
                "width": 1.15,
            })
            relationship_lines.append({
                "x1": child["center"],
                "y1": (parent_y + child_y) / 2,
                "x2": child["center"],
                "y2": child_y,
                "width": 1.15,
            })

    data = {
        "title": "Hermina Steiner family list",
        "description": "A separate numbered family list, shown without merging its abbreviated names into the main chart.",
        "summary": f"{len(records)} entries transcribed from the numbered Steiner family list",
        "source": "Steiner list workbook · first worksheet",
        "width": max(920, leaf_index * UNIT_SPACING + 100),
        "height": 150 + max(len(code) - len(root) for code in records) * GENERATION_HEIGHT,
        "people": people,
        "labels": labels,
        "lines": relationship_lines,
    }
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_text(json.dumps(data, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"Exported {len(records)} family records to {destination}")


if __name__ == "__main__":
    project = Path(__file__).resolve().parent.parent
    source_path = Path(sys.argv[1]).resolve() if len(sys.argv) > 1 else project / "docs" / "steiner list.xls"
    destination_path = Path(sys.argv[2]).resolve() if len(sys.argv) > 2 else project / "data" / "steiner-list-tree.json"
    if not source_path.is_file():
        raise SystemExit("Source workbook not found: " + str(source_path))
    export(source_path, destination_path)
