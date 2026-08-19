"""Synthesise a plausible ERA5-HEAT NetCDF to test the render path."""
import numpy as np
from netCDF4 import Dataset

LAT = np.arange(90, -60.25, -0.25)      # 90N..60S as documented
LON = np.arange(0, 360, 0.25)            # ERA5 convention: 0..359.75
DOY = 196                                # mid July

def make(path, day_offset):
    lat2d, lon2d = np.meshgrid(LAT, LON, indexing="ij")
    decl = 23.44 * np.sin(np.radians(360 * (DOY - 81) / 365))
    # crude seasonal/latitudinal base field, deliberately not physical
    base = 30 - 0.9 * np.abs(lat2d - decl) + 6 * np.cos(np.radians(3 * lon2d))
    with Dataset(path, "w") as ds:
        ds.createDimension("time", 24)
        ds.createDimension("latitude", len(LAT))
        ds.createDimension("longitude", len(LON))
        v = ds.createVariable("utci", "f4", ("time", "latitude", "longitude"), zlib=True)
        v.units = "K"
        ds.createVariable("latitude", "f8", ("latitude",))[:] = LAT
        ds.createVariable("longitude", "f8", ("longitude",))[:] = LON
        t = ds.createVariable("time", "i4", ("time",)); t.units = "hours since 2026-07-15"
        t[:] = np.arange(24) + 24 * day_offset
        for h in range(24):
            solar = (h + lon2d / 15.0 + 24 * day_offset) % 24      # local solar hour
            diurnal = 9 * np.cos(np.radians((solar - 15) * 15))    # peak at 15:00 local
            v[h] = base + diurnal + 273.15
    print("wrote", path)

make("fake_day1.nc", 0)
make("fake_day2.nc", 1)
