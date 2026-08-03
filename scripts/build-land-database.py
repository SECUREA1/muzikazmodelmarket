#!/usr/bin/env python3
"""Build and validate the SQLite version of the MUZIKAZ land catalog."""

import argparse
import json
import sqlite3
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
JSON_PATH = ROOT / "data" / "land-worlds.json"
DB_PATH = ROOT / "data" / "land-worlds.sqlite"


def load_catalog():
    with JSON_PATH.open(encoding="utf-8") as source:
        catalog = json.load(source)
    location_ids = {item["id"] for item in catalog["locations"]}
    if len(location_ids) != len(catalog["locations"]):
        raise ValueError("Location IDs must be unique")
    for edge in catalog["connections"]:
        if edge["from"] not in location_ids or edge["to"] not in location_ids:
            raise ValueError(f"Unknown connection endpoint: {edge}")
    profile_ids = {item["id"] for item in catalog["profiles"]}
    backpack_ids = {item["id"] for item in catalog["backpacks"]}
    space_ids = {item["id"] for item in catalog["spaces"]}
    if len(space_ids) != len(catalog["locations"]):
        raise ValueError("Every fixed map location must have exactly one correlated space")
    public_location_ids = {item["id"] for item in catalog["locations"] if item["public_area"]}
    plot_location_ids = {item["location_id"] for item in catalog["public_area_plots"]}
    if plot_location_ids != public_location_ids:
        raise ValueError("Every public area must have exactly one public-area plot")
    for plot in catalog["public_area_plots"]:
        if plot["claimed"] != bool(plot["owner_profile_id"]):
            raise ValueError(f"Plot claimed state and owner must agree: {plot['id']}")
        if plot["owner_profile_id"] and plot["owner_profile_id"] not in profile_ids:
            raise ValueError(f"Plot has an unknown owner: {plot['id']}")
        if plot["free_community_spots"] != 1:
            raise ValueError(f"Public-area claims must include one free community spot: {plot['id']}")
    for space in catalog["spaces"]:
        location = next((item for item in catalog["locations"] if item["id"] == space["location_id"]), None)
        if not location or (space["pixel_x"], space["pixel_y"]) != (location["x"], location["y"]):
            raise ValueError(f"Space pixel does not correlate with its map location: {space['id']}")
        if space["profile_id"] not in profile_ids or space["backpack_id"] not in backpack_ids:
            raise ValueError(f"Space has an unknown profile or backpack: {space['id']}")
    for profile in catalog["profiles"]:
        if profile["backpack_id"] not in backpack_ids or profile["home_space_id"] not in space_ids:
            raise ValueError(f"Profile correlation is incomplete: {profile['id']}")
    return catalog


def build_database(catalog):
    DB_PATH.unlink(missing_ok=True)
    connection = sqlite3.connect(DB_PATH)
    connection.executescript("""
        PRAGMA foreign_keys = ON;
        CREATE TABLE metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
        CREATE TABLE locations (
            id TEXT PRIMARY KEY,
            name TEXT NOT NULL UNIQUE,
            kind TEXT NOT NULL CHECK (kind IN ('land_world', 'three_d_environment')),
            x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 100),
            y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 100),
            price_usd REAL NOT NULL CHECK (price_usd >= 0),
            public_area INTEGER NOT NULL CHECK (public_area IN (0, 1)),
            starter_plot INTEGER NOT NULL CHECK (starter_plot IN (0, 1)),
            environment_id TEXT,
            detail TEXT NOT NULL
        );
        CREATE TABLE location_connections (
            from_location_id TEXT NOT NULL REFERENCES locations(id),
            to_location_id TEXT NOT NULL REFERENCES locations(id),
            PRIMARY KEY (from_location_id, to_location_id),
            CHECK (from_location_id <> to_location_id)
        );
        CREATE TABLE wild_land_claims (
            id INTEGER PRIMARY KEY,
            owner_id TEXT NOT NULL UNIQUE,
            deed_asset TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT 'Wild New Land',
            x INTEGER NOT NULL CHECK (x BETWEEN 0 AND 100),
            y INTEGER NOT NULL CHECK (y BETWEEN 0 AND 100),
            connected_public_area_id TEXT REFERENCES locations(id),
            claimed_at TEXT NOT NULL
        );
        CREATE TABLE public_area_plots (
            id TEXT PRIMARY KEY,
            location_id TEXT NOT NULL UNIQUE REFERENCES locations(id),
            owner_profile_id TEXT REFERENCES profiles(id),
            owner_display_name TEXT,
            claimed INTEGER NOT NULL CHECK (claimed IN (0, 1)),
            free_community_spots INTEGER NOT NULL DEFAULT 1 CHECK (free_community_spots = 1),
            CHECK ((claimed = 1 AND owner_profile_id IS NOT NULL AND owner_display_name IS NOT NULL) OR
                   (claimed = 0 AND owner_profile_id IS NULL AND owner_display_name IS NULL))
        );
        CREATE TABLE profiles (
            id TEXT PRIMARY KEY, display_name TEXT NOT NULL,
            backpack_id TEXT NOT NULL UNIQUE, home_space_id TEXT NOT NULL UNIQUE
        );
        CREATE TABLE backpacks (
            id TEXT PRIMARY KEY, profile_id TEXT NOT NULL UNIQUE REFERENCES profiles(id),
            asset_ids TEXT NOT NULL
        );
        CREATE TABLE land_spaces (
            id TEXT PRIMARY KEY, location_id TEXT NOT NULL UNIQUE REFERENCES locations(id),
            profile_id TEXT NOT NULL REFERENCES profiles(id), backpack_id TEXT NOT NULL REFERENCES backpacks(id),
            pixel_x INTEGER NOT NULL CHECK(pixel_x BETWEEN 0 AND 100), pixel_y INTEGER NOT NULL CHECK(pixel_y BETWEEN 0 AND 100),
            pin_order INTEGER NOT NULL, is_home_base INTEGER NOT NULL CHECK(is_home_base IN (0,1)), pinned INTEGER NOT NULL CHECK(pinned IN (0,1)),
            UNIQUE(profile_id, pin_order), UNIQUE(pixel_x, pixel_y)
        );
        CREATE TABLE permanent_objects (
            id TEXT PRIMARY KEY, profile_id TEXT NOT NULL REFERENCES profiles(id), backpack_id TEXT NOT NULL REFERENCES backpacks(id),
            space_id TEXT NOT NULL REFERENCES land_spaces(id), asset_id TEXT NOT NULL,
            local_x REAL NOT NULL, local_y REAL NOT NULL, local_z REAL NOT NULL,
            placed_at TEXT NOT NULL, UNIQUE(profile_id, space_id, asset_id, local_x, local_y, local_z)
        );
        CREATE VIEW location_connection_counts AS
        SELECT l.id, l.name, l.public_area, COUNT(e.neighbor_id) AS connection_count
        FROM locations l
        LEFT JOIN (
            SELECT from_location_id AS location_id, to_location_id AS neighbor_id FROM location_connections
            UNION ALL
            SELECT to_location_id, from_location_id FROM location_connections
        ) e ON e.location_id = l.id
        GROUP BY l.id, l.name, l.public_area;
    """)
    rules = catalog["pinning_rules"]
    metadata = {
        "schema_version": catalog["schema_version"],
        "fixed_pinnable_locations": len(catalog["locations"]),
        "starter_world_plots": sum(item["starter_plot"] for item in catalog["locations"]),
        "public_areas": sum(item["public_area"] for item in catalog["locations"]),
        "wild_land_capacity": rules["wild_land_capacity"],
        "wild_land_limit_per_owner": rules["wild_land_limit_per_owner"],
    }
    connection.executemany("INSERT INTO metadata VALUES (?, ?)", ((key, str(value)) for key, value in metadata.items()))
    connection.executemany(
        "INSERT INTO locations VALUES (:id, :name, :kind, :x, :y, :price_usd, :public_area, :starter_plot, :environment_id, :detail)",
        catalog["locations"],
    )
    connection.executemany(
        "INSERT INTO location_connections VALUES (:from, :to)", catalog["connections"]
    )
    connection.executemany("INSERT INTO profiles VALUES (:id, :display_name, :backpack_id, :home_space_id)", catalog["profiles"])
    connection.executemany("INSERT INTO public_area_plots VALUES (:id, :location_id, :owner_profile_id, :owner_display_name, :claimed, :free_community_spots)", catalog["public_area_plots"])
    connection.executemany(
        "INSERT INTO wild_land_claims(owner_id, deed_asset, name, x, y, connected_public_area_id, claimed_at) VALUES (:owner_id, :deed_asset, :name, :x, :y, :connected_public_area_id, :claimed_at)",
        catalog["wild_land_claims"],
    )
    connection.executemany("INSERT INTO backpacks VALUES (:id, :profile_id, :asset_ids)", ({**item, "asset_ids": json.dumps(item["asset_ids"])} for item in catalog["backpacks"]))
    connection.executemany("INSERT INTO land_spaces VALUES (:id, :location_id, :profile_id, :backpack_id, :pixel_x, :pixel_y, :pin_order, :is_home_base, :pinned)", catalog["spaces"])
    connection.executemany("INSERT INTO permanent_objects VALUES (:id, :profile_id, :backpack_id, :space_id, :asset_id, :local_x, :local_y, :local_z, :placed_at)", catalog["permanent_objects"])
    connection.commit()
    connection.execute("PRAGMA optimize")
    connection.close()


def validate_database(catalog):
    connection = sqlite3.connect(DB_PATH)
    actual = {
        "locations": connection.execute("SELECT COUNT(*) FROM locations").fetchone()[0],
        "connections": connection.execute("SELECT COUNT(*) FROM location_connections").fetchone()[0],
        "public": connection.execute("SELECT COUNT(*) FROM locations WHERE public_area = 1").fetchone()[0],
        "starter": connection.execute("SELECT COUNT(*) FROM locations WHERE starter_plot = 1").fetchone()[0],
        "claims": connection.execute("SELECT COUNT(*) FROM wild_land_claims").fetchone()[0],
        "spaces": connection.execute("SELECT COUNT(*) FROM land_spaces").fetchone()[0],
        "public_plots": connection.execute("SELECT COUNT(*) FROM public_area_plots").fetchone()[0],
        "owned_public_plots": connection.execute("SELECT COUNT(*) FROM public_area_plots WHERE claimed = 1").fetchone()[0],
    }
    connection.close()
    expected = {
        "locations": catalog["calculated_totals"]["fixed_pinnable_locations"],
        "connections": catalog["calculated_totals"]["fixed_route_connections"],
        "public": catalog["calculated_totals"]["public_areas"],
        "starter": catalog["pinning_rules"]["starter_world_plots"],
        "claims": catalog["calculated_totals"]["wild_land_claims_seeded"],
        "spaces": catalog["calculated_totals"]["fixed_pinnable_locations"],
        "public_plots": catalog["calculated_totals"]["public_plots_exist"],
        "owned_public_plots": catalog["calculated_totals"]["public_plots_owned"],
    }
    if actual != expected:
        raise ValueError(f"Database totals {actual} do not match JSON totals {expected}")
    print(f"land database valid: {actual}")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="validate the existing database without rebuilding it")
    args = parser.parse_args()
    catalog = load_catalog()
    if not args.check:
        build_database(catalog)
    validate_database(catalog)


if __name__ == "__main__":
    main()
