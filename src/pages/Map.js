"use client";

import React, { useRef, useEffect, useState } from "react";
import mapboxgl from "!mapbox-gl"; // eslint-disable-line import/no-webpack-loader-syntax
import "mapbox-gl/dist/mapbox-gl.css";
import * as turf from "@turf/turf";
// test data
// import { drivers } from "../data/drivers";
// import { mapActions } from "../data/actions";
// test data end

import { drivers } from "../data/driver_route";
import { actions as mapActions } from "../data/actions_list";
import { importImage } from "../images/images";
import { appConfig, mapConfig } from "../config";
import { segmentMultiLineString } from "../utils/calculate";
import { actionsHandling } from "../utils/actionsHandling";
import { driverNaming } from "../utils/naming";
import { DriverStatus } from "../utils/driversHandling";

mapboxgl.accessToken = appConfig.mapboxToken;

const carYellow = importImage("car-yellow");
const carRed = importImage("car-red");
const carGreen = importImage("car-green");

export default function MapGL() {
  const mapContainer = useRef(null);
  const tooltipRef = useRef(null);
  const map = useRef(null);
  const [lng, setLng] = useState(mapConfig.startingLontitude);
  const [lat, setLat] = useState(mapConfig.startingLatitude);
  const [selectedPassenger, setSelectedPassenger] = useState(null);
  const [selectedDriver, setSelectedDriver] = useState(null);
  const [zoom, setZoom] = useState(mapConfig.zoomingLevel);
  const driverLocations = new Map();
  const driverRoutes = new Map();
  const totalSteps = drivers[0].route.length;
  let totalTimeIntervals =
    (drivers[0].route.length - 1) * mapConfig.carMovingStepsPerTimeInterval;

  // Map set up
  useEffect(() => {
    if (map.current) return;
    map.current = new mapboxgl.Map({
      container: mapContainer.current,
      style: "mapbox://styles/mapbox/dark-v11",
      center: [lng, lat],
      zoom: zoom,
    });
    // map.current.scrollZoom.disable();
  });

  useEffect(() => {
    if (!map.current) return;
    map.current.on("move", () => {
      setLng(map.current.getCenter().lng.toFixed(4));
      setLat(map.current.getCenter().lat.toFixed(4));
      setZoom(map.current.getZoom().toFixed(2));
    });
  });

  const addCars = () => {
    for (let i = 0; i < drivers.length; i++) {
      const driver = drivers[i];
      const originalCoordinates = driver.route[0];
      const { driverSourceName, driverLayerName } = driverNaming(driver.id);

      driverRoutes[driver.id] = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: {
              type: "LineString",
              coordinates: driver.route,
            },
          },
        ],
      };

      driverLocations[driver.id] = {
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            properties: {},
            geometry: {
              type: "Point",
              coordinates: originalCoordinates,
            },
          },
        ],
      };

      let { arc } = segmentMultiLineString(
        driverRoutes[driver.id].features[0].geometry.coordinates
      );
      driverRoutes[driver.id].features[0].geometry.coordinates =
        Array.from(arc);

      map.current.addSource(driverSourceName, {
        type: "geojson",
        data: driverLocations[driver.id],
      });

      map.current.addLayer({
        id: driverLayerName,
        source: driverSourceName,
        type: "symbol",
        layout: {
          "icon-image": DriverStatus.idle,
          "icon-rotate": ["get", "bearing"],
          "icon-rotation-alignment": "map",
          "icon-allow-overlap": true,
          "icon-ignore-placement": true,
        },
      });

      map.current.on("click", driverLayerName, (e) => {
        setSelectedDriver(driver.id);
      });
    }
  };

  useEffect(() => {
    map.current.on("load", () => {
      map.current.addImage(DriverStatus.drivingToPickup, carYellow, {
        pixelRatio: 2,
      });
      map.current.addImage(DriverStatus.idle, carGreen, { pixelRatio: 2 });
      map.current.addImage(DriverStatus.drivingToDropoff, carRed, {
        pixelRatio: 2,
      });
      addCars();
      var counter = 0;
      function animate() {
        for (let i = 0; i < drivers.length; i++) {
          const driver = drivers[i];
          driverLocations[driver.id].features[0].geometry.coordinates =
            driverRoutes[driver.id].features[0].geometry.coordinates[counter];

          const { driverSourceName, driverPickingUpRouteSourceName } =
            driverNaming(driver.id);

          map.current
            .getSource(driverSourceName)
            .setData(driverLocations[driver.id]);

          if (map.current.getSource(driverPickingUpRouteSourceName)) {
            var currentData = map.current.getSource(
              driverPickingUpRouteSourceName
            )._data;
            currentData.features[0].geometry.coordinates.pop();
            map.current
              .getSource(driverPickingUpRouteSourceName)
              .setData(currentData);
          }
        }

        const currentStep = Math.floor(
          counter / mapConfig.carMovingStepsPerTimeInterval
        );
        if (counter % mapConfig.carMovingStepsPerTimeInterval === 0) {
          console.log(`${currentStep} / ${totalSteps}`);

          for (let i = 0; i < drivers.length; i++) {
            const driver = drivers[i];
            if (
              driverRoutes[driver.id].features[0].geometry.coordinates[
                counter
              ][0] ===
                driverRoutes[driver.id].features[0].geometry.coordinates[
                  counter + 1
                ][0] &&
              driverRoutes[driver.id].features[0].geometry.coordinates[
                counter
              ][1] ===
                driverRoutes[driver.id].features[0].geometry.coordinates[
                  counter + 1
                ][1]
            )
              continue;
            driverLocations[driver.id].features[0].properties.bearing =
              turf.bearing(
                turf.point(
                  driverRoutes[driver.id].features[0].geometry.coordinates[
                    counter >= totalTimeIntervals ? counter - 1 : counter
                  ]
                ),
                turf.point(
                  driverRoutes[driver.id].features[0].geometry.coordinates[
                    counter >= totalTimeIntervals ? counter : counter + 1
                  ]
                )
              );
            driverLocations[driver.id].features[0].properties.bearing =
              turf.bearing(
                turf.point(
                  driverRoutes[driver.id].features[0].geometry.coordinates[
                    counter >= totalTimeIntervals ? counter - 1 : counter
                  ]
                ),
                turf.point(
                  driverRoutes[driver.id].features[0].geometry.coordinates[
                    counter >= totalTimeIntervals ? counter : counter + 1
                  ]
                )
              );
          }

          if (mapActions[currentStep * mapConfig.timeInterval]) {
            console.log(mapActions[currentStep * mapConfig.timeInterval]);
            for (const action of mapActions[
              currentStep * mapConfig.timeInterval
            ]) {
              actionsHandling(
                map.current,
                action.actionType,
                action.data,
                counter,
                driverRoutes,
                setSelectedPassenger
              );
            }
          }
        }

        if (counter < totalTimeIntervals - 1) {
          requestAnimationFrame(animate);
        }
        counter = counter + 1;
      }
      animate(counter);
    });
  });

  return (
    <div className="w-screen h-screen">
      <div className="fixed top-0 left-0 right-0 bg-slate-600 z-10">
        Longitude: {lng} | Latitude: {lat} | Zoom: {zoom} | Hong Kong | current
        driver {selectedDriver} | current passenger {selectedPassenger}
      </div>
      <div
        ref={tooltipRef}
        className="hidden absolute bg-white p-10 rounded text-sm z-20 text-black"
      ></div>
      <div className="w-screen h-screen" ref={mapContainer} />
    </div>
  );
}
