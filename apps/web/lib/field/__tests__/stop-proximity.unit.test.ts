import { describe, expect, it } from "vitest";
import { geofenceMeters, isStopNearProperty, matchCustomerAtStop } from "../stop-proximity";

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
});