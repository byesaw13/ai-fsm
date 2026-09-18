import { describe, expect, it } from "vitest";
import {
  geofenceMeters,
  isDifferentPropertyStill,
  isStopNearProperty,
  matchCustomerAtStop,
  relocationRadiusForStop,
} from "../stop-proximity";
import { DEFAULT_RELOCATION_METERS, MIN_RELOCATION_METERS } from "@ai-fsm/domain";

describe("stop-proximity", () => {
  const stop = { latitude: 42.9956, longitude: -71.4548 };

  it("rejects matches beyond geofence even with schedule boost", () => {
    const far = matchCustomerAtStop(stop, 20, [
      {
        propertyId: "p1",
        clientId: "c1",
        clientName: "Far Away",
        address: "99 Other St",
        latitude: 43.05,
        longitude: -71.5,
        geofenceRadiusFeet: 150,
        scheduledToday: true,
        jobId: "j1",
        visitId: "v1",
      },
    ]);
    expect(far).toBeNull();
  });

  it("accepts match when stop is within 150ft of property pin", () => {
    const near = matchCustomerAtStop(stop, 10, [
      {
        propertyId: "p1",
        clientId: "c1",
        clientName: "Gina",
        address: "142 Brock",
        latitude: 42.99565,
        longitude: -71.45485,
        geofenceRadiusFeet: 150,
        scheduledToday: false,
        jobId: null,
        visitId: null,
      },
    ]);
    expect(near?.clientName).toBe("Gina");
    expect(near?.distanceMeters).toBeLessThanOrEqual(76);
  });

  it("isStopNearProperty respects per-property geofence cap", () => {
    expect(
      isStopNearProperty(stop, {
        latitude: 42.99565,
        longitude: -71.45485,
        geofenceRadiusFeet: 150,
      }),
    ).toBe(true);
    expect(geofenceMeters(500)).toBeLessThanOrEqual(250 * 0.3048);
  });

  it("relocationRadiusForStop uses unmatched default when no property hits", () => {
    expect(
      relocationRadiusForStop({ latitude: 42.9956, longitude: -71.4548 }, []),
    ).toBeCloseTo(DEFAULT_RELOCATION_METERS);
  });

  it("relocationRadiusForStop floors a 150ft match at 80m (TASK-148)", () => {
    const r = relocationRadiusForStop(stop, [
      {
        propertyId: "p1",
        clientId: "c1",
        clientName: "Gina",
        address: "142 Brock",
        latitude: 42.99565,
        longitude: -71.45485,
        geofenceRadiusFeet: 150,
        jobId: "j1",
      },
    ]);
    expect(r).toBe(MIN_RELOCATION_METERS);
  });

  it("isDifferentPropertyStill holds on unmatched neighbor geocode (TASK-150)", () => {
    const ash = {
      propertyId: "p-ash",
      clientId: "c1",
      clientName: "Peter",
      address: "4 Ash St",
      latitude: 42.789695,
      longitude: -71.247093,
      geofenceRadiusFeet: 250,
      jobId: "j1",
    };
    const open = { latitude: 42.7896, longitude: -71.2471 };
    // ~110m north — outside 80m floor, no other property → hold
    expect(
      isDifferentPropertyStill(
        open,
        { latitude: 42.7906, longitude: -71.2471 },
        [ash],
        MIN_RELOCATION_METERS,
      ),
    ).toBe(false);
  });

  it("isDifferentPropertyStill splits when the ping is a different known property", () => {
    const ash = {
      propertyId: "p-ash",
      clientId: "c1",
      clientName: "Peter",
      address: "4 Ash St",
      latitude: 42.789695,
      longitude: -71.247093,
      geofenceRadiusFeet: 250,
      jobId: "j1",
    };
    const landing = {
      propertyId: "p-landing",
      clientId: "c2",
      clientName: "TJ",
      address: "63 Landing",
      latitude: 42.801,
      longitude: -71.26,
      geofenceRadiusFeet: 150,
      jobId: "j2",
    };
    expect(
      isDifferentPropertyStill(
        { latitude: 42.7896, longitude: -71.2471 },
        { latitude: 42.801, longitude: -71.26 },
        [ash, landing],
        MIN_RELOCATION_METERS,
      ),
    ).toBe(true);
  });
});