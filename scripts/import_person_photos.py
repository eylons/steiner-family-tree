#!/usr/bin/env python3
"""Import gallery photos whose filenames identify people in the family chart."""

import hashlib
import json
import re
import shutil
import subprocess
import unicodedata
from collections import defaultdict
from pathlib import Path
from urllib.parse import unquote


ALIASES = {
    "erzs": "ersze",
    "erzsi": "ersze",
    "hermina": "hermine",
    "jenu": "jeno",
    "juda": "jehuda",
    "gemeiner": "gmeiner",
    "gemainer": "gmeiner",
    "lindenfield": "lindenfeld",
    "lindefeld": "lindenfeld",
    "schlezinger": "schlesinger",
    "shlesinger": "schlesinger",
    "stenier": "steiner",
}
UNMATCHED_PERSON_LABELS = {"family", "more"}
SUPPORTED_PHOTO_TYPES = {".jpg", ".jpeg", ".png"}
PERSON_ID_REDIRECTS = {
}
EXPLICIT_GALLERY_ASSIGNMENTS = {
    "more_pics/Yael": "50-9",
}


def normalize(value):
    value = value.casefold().replace("ß", "ss")
    value = re.sub(r"(?<=[a-z])['’]s\b", " s", value)
    value = re.sub(r"(?<=[a-z])['’](?=[a-z])", "", value)
    value = unicodedata.normalize("NFKD", value)
    value = "".join(character for character in value if not unicodedata.combining(character))
    return re.sub(r"[^a-z0-9]+", " ", value).strip()


def normalized_tokens(value):
    return [ALIASES.get(token, token) for token in normalize(value).split()]


def display_filename(value):
    for _ in range(5):
        decoded = unquote(value)
        if decoded == value:
            break
        value = decoded
    return value


def main():
    project_directory = Path(__file__).resolve().parent.parent
    gallery_directory = project_directory / "steiner_gallery"
    tree_path = project_directory / "data" / "tree.json"
    photo_directory = project_directory / "assets" / "person-photos"
    thumbnail_directory = photo_directory / "thumbnails"
    manifest_path = project_directory / "data" / "person-photos.json"

    if not gallery_directory.is_dir():
        raise SystemExit("Photo gallery folder not found: " + str(gallery_directory))
    if not tree_path.is_file():
        raise SystemExit("Family tree data not found: " + str(tree_path))

    tree = json.loads(tree_path.read_text(encoding="utf-8"))
    people = tree["people"]
    people_by_id = {person["id"]: person for person in people}
    first_names = defaultdict(list)
    for person in people:
        first_tokens = normalized_tokens(person["first_name"])
        if not first_tokens or set(first_tokens) & UNMATCHED_PERSON_LABELS:
            continue
        first_names[first_tokens[0]].append(person)
    galleries = [(gallery_directory, None)]
    for relative_directory, person_id in EXPLICIT_GALLERY_ASSIGNMENTS.items():
        source_directory = project_directory / relative_directory
        if not source_directory.is_dir():
            raise SystemExit("Photo gallery folder not found: " + str(source_directory))
        if person_id not in people_by_id:
            raise SystemExit("Explicit photo assignment references unknown person: " + person_id)
        galleries.append((source_directory, person_id))

    files = sorted(
        (
            (path, source_directory, person_id)
            for source_directory, person_id in galleries
            for path in source_directory.rglob("*")
            if path.is_file() and path.suffix.casefold() in SUPPORTED_PHOTO_TYPES
        ),
        key=lambda item: item[0].as_posix(),
    )
    photos = {}
    source_to_asset = {}
    matched_files = 0
    existing_assets = {}
    for image_path in photo_directory.glob("*.jpg"):
        digest = hashlib.sha256(image_path.read_bytes()).hexdigest()
        existing_assets.setdefault(digest, image_path)

    for source, source_directory, assigned_person_id in files:
        words = normalized_tokens(source.stem)
        filename_tokens = set(words)
        if assigned_person_id:
            matched_people = {assigned_person_id: people_by_id[assigned_person_id]}
        else:
            matched_people = {}
            for first_name, candidates in first_names.items():
                if first_name not in filename_tokens:
                    continue

                distinct_names = {normalize(candidate["name"]) for candidate in candidates}
                if len(distinct_names) == 1:
                    for candidate in candidates:
                        matched_people[candidate["id"]] = candidate
                    continue

                matching_candidates = []
                for word_index, word in enumerate(words):
                    if word != first_name:
                        continue
                    nearby_tokens = set(words[word_index + 1:word_index + 6])
                    for candidate in candidates:
                        last_tokens = set(normalized_tokens(candidate["last_name"]))
                        last_tokens.discard("")
                        if last_tokens and nearby_tokens & last_tokens:
                            matching_candidates.append(candidate)
                for candidate in matching_candidates:
                    matched_people[candidate["id"]] = candidate

        if not matched_people:
            continue

        matched_files += 1
        if source not in source_to_asset:
            relative_source = source.relative_to(project_directory).as_posix()
            content_digest = hashlib.sha256(source.read_bytes()).hexdigest()
            existing_image = existing_assets.get(content_digest)
            if existing_image:
                filename = existing_image.name
                source_to_asset[source] = {
                    "filename": display_filename(source.name),
                    "src": "assets/person-photos/" + filename,
                    "thumbnail": "assets/person-photos/thumbnails/" + filename,
                }
                photo = source_to_asset[source]
            else:
                digest = hashlib.sha256(relative_source.encode("utf-8")).hexdigest()[:10]
                slug = normalize(display_filename(source.stem)).replace(" ", "-")[:60].strip("-") or "family-photo"
                filename = slug + "-" + digest + ".jpg"
                image_path = photo_directory / filename
                thumbnail_path = thumbnail_directory / filename
                photo_directory.mkdir(parents=True, exist_ok=True)
                thumbnail_directory.mkdir(parents=True, exist_ok=True)
                if source.suffix.casefold() in {".jpg", ".jpeg"}:
                    shutil.copy2(source, image_path)
                else:
                    subprocess.run(
                        ["sips", "-s", "format", "jpeg", str(source), "--out", str(image_path)],
                        check=True,
                        capture_output=True,
                        text=True,
                    )
                subprocess.run(
                    ["sips", "-Z", "720", "-s", "format", "jpeg", str(image_path), "--out", str(thumbnail_path)],
                    check=True,
                    capture_output=True,
                    text=True,
                )
                existing_assets[content_digest] = image_path
                source_to_asset[source] = {
                    "filename": display_filename(source.name),
                    "src": "assets/person-photos/" + filename,
                    "thumbnail": "assets/person-photos/thumbnails/" + filename,
                }

        photo = source_to_asset[source]
        for person_id in matched_people:
            person_id = PERSON_ID_REDIRECTS.get(person_id, person_id)
            person_photos = photos.setdefault(person_id, [])
            if all(existing["src"] != photo["src"] for existing in person_photos):
                person_photos.append(photo)

    for person_photos in photos.values():
        person_photos.sort(key=lambda photo: photo["filename"].casefold())

    manifest_path.write_text(
        json.dumps({"photos": photos}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8",
    )

    print("Matched {} of {} gallery photos to {} chart entries.".format(
        matched_files, len(files), len(photos)
    ))
    for person in people:
        person_photos = photos.get(person["id"])
        if person_photos:
            print("{} ({}): {} photo(s)".format(
                person["name"], person["id"], len(person_photos)
            ))
    print("Generated photo manifest: " + str(manifest_path))


if __name__ == "__main__":
    main()
