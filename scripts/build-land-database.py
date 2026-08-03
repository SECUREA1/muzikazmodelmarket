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
    connection.executemany(
        "INSERT INTO wild_land_claims(owner_id, deed_asset, name, x, y, connected_public_area_id, claimed_at) VALUES (:owner_id, :deed_asset, :name, :x, :y, :connected_public_area_id, :claimed_at)",
        catalog["wild_land_claims"],
    )
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
    }
    connection.close()
    expected = {
        "locations": catalog["calculated_totals"]["fixed_pinnable_locations"],
        "connections": catalog["calculated_totals"]["fixed_route_connections"],
        "public": catalog["calculated_totals"]["public_areas"],
        "starter": catalog["pinning_rules"]["starter_world_plots"],
        "claims": catalog["calculated_totals"]["wild_land_claims_seeded"],
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
