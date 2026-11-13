"""Writes ../data/cities.json, the places the page's hover readout names:

    .venv/bin/python cities.py

From GeoNames (CC BY 4.0, https://download.geonames.org/export/dump/):
cities15000.txt (unzipped) and countryInfo.txt in cache/sources/. Keeps
cities of at least 100,000 people, leaving out parts of cities (PPLX), as
[name, country, lat, lon] with coordinates to 0.01°, largest first.
"""

import json
import os

HERE = os.path.dirname(os.path.abspath(__file__))
SOURCES = os.path.join(HERE, 'cache', 'sources')
OUT = os.path.join(HERE, '..', 'data', 'cities.json')
MIN_POPULATION = 100_000


def main():
    countries = {}
    with open(os.path.join(SOURCES, 'countryInfo.txt'), encoding='utf-8') as f:
        for line in f:
            if line.startswith('#'):
                continue
            cols = line.rstrip('\n').split('\t')
            countries[cols[0]] = cols[4]
    cities = []
    with open(os.path.join(SOURCES, 'cities15000.txt'), encoding='utf-8') as f:
        for line in f:
            cols = line.rstrip('\n').split('\t')
            population = int(cols[14] or 0)
            if population < MIN_POPULATION or cols[7] == 'PPLX':
                continue
            cities.append((population, cols[1], countries.get(cols[8], cols[8]),
                           round(float(cols[4]), 2), round(float(cols[5]), 2)))
    cities.sort(reverse=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump([c[1:] for c in cities], f, ensure_ascii=False, separators=(',', ':'))
    print(f'{len(cities)} cities, {os.path.getsize(OUT) / 1e3:.0f} KB')


if __name__ == '__main__':
    main()
