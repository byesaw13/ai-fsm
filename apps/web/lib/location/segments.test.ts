import { describe, it, expect } from "vitest";
import { reduceLocationEvent, type OpenSegment, type IncomingLocationEvent } from "./segments";

const T1 = "2026-06-19T13:00:00.000Z";
const T2 = "2026-06-19T13:30:00.000Z";

function stop(over: Partial<OpenSegment> = {}): OpenSegment {
  return { id: "s1", kind: "stop", startedAt: T1, zone: null, placeLabel: null, latitude: null, longitude: null, vehicleId: null, ...over };
}
function drive(over: Partial<OpenSegment> = {}): OpenSegment {
  return { id: "d1", kind: "drive", startedAt: T1, zone: null, placeLabel: null, latitude: null, longitude: null, vehicleId: null, ...over };
}
function ev(over: Partial<IncomingLocationEvent> & { kind: IncomingLocationEvent["kind"] }): IncomingLocationEvent {
  return { occurredAt: T2, ...over };
}

describe("reduceLocationEvent — zone_enter", () => {
  it("opens a stop with no prior open segment", () => {
    const out = reduceLocationEvent(null, ev({ kind: "zone_enter", zone: "home" }));
    expect(out.closeOpen).toBeUndefined();
    expect(out.open).toMatchObject({ kind: "stop", startedAt: T2, zone: "home", placeLabel: "home" });
  });

  it("closes an open drive then opens a stop", () => {
    const out = reduceLocationEvent(drive(), ev({ kind: "zone_enter", zone: "ferguson" }));
    expect(out.closeOpen).toEqual({ endedAt: T2 });
    expect(out.open?.kind).toBe("stop");
  });

  it("suggests material_run for a supply-house zone", () => {
    const out = reduceLocationEvent(null, ev({ kind: "zone_enter", zone: "Ferguson Plumbing Supply" }));
    expect(out.open?.suggestedActivityType).toBe("material_run");
  });

  it("does not suggest an activity for an unknown (customer) zone", () => {
    const out = reduceLocationEvent(null, ev({ kind: "zone_enter", zone: "home" }));
    expect(out.open?.suggestedActivityType).toBeNull();
  });

  it("is a no-op when already parked in the same zone", () => {
    const out = reduceLocationEvent(stop({ zone: "home" }), ev({ kind: "zone_enter", zone: "home" }));
    expect(out).toEqual({});
  });
});

describe("reduceLocationEvent — zone_leave", () => {
  it("closes the open stop and opens a drive (travel)", () => {
    const out = reduceLocationEvent(stop({ zone: "home" }), ev({ kind: "zone_leave", zone: "home" }));
    expect(out.closeOpen).toEqual({ endedAt: T2 });
    expect(out.open).toMatchObject({ kind: "drive", suggestedActivityType: "travel" });
  });

  it("is a no-op when already driving", () => {
    const out = reduceLocationEvent(drive(), ev({ kind: "zone_leave", zone: "home" }));
    expect(out).toEqual({});
  });

  it("opens a drive even with no prior segment", () => {
    const out = reduceLocationEvent(null, ev({ kind: "zone_leave", zone: "home" }));
    expect(out.closeOpen).toBeUndefined();
    expect(out.open?.kind).toBe("drive");
  });
});

describe("reduceLocationEvent — activity_change", () => {
  it("in_vehicle opens a drive when stopped", () => {
    const out = reduceLocationEvent(stop({ zone: "home" }), ev({ kind: "activity_change", detectedActivity: "in_vehicle" }));
    expect(out.closeOpen).toEqual({ endedAt: T2 });
    expect(out.open?.kind).toBe("drive");
  });

  it("in_vehicle is a no-op when already driving", () => {
    const out = reduceLocationEvent(drive(), ev({ kind: "activity_change", detectedActivity: "in_vehicle" }));
    expect(out).toEqual({});
  });

  it("still closes a drive and opens a stop at the geocoded address", () => {
    const out = reduceLocationEvent(
      drive(),
      ev({ kind: "activity_change", detectedActivity: "still", geocodedAddress: "14 Oak St" }),
    );
    expect(out.closeOpen).toEqual({ endedAt: T2 });
    expect(out.open).toMatchObject({ kind: "stop", placeLabel: "14 Oak St" });
  });

  it("still is a no-op when already stopped", () => {
    const out = reduceLocationEvent(stop(), ev({ kind: "activity_change", detectedActivity: "still" }));
    expect(out).toEqual({});
  });

  it("ignores walking/unknown as non-transitions", () => {
    expect(reduceLocationEvent(drive(), ev({ kind: "activity_change", detectedActivity: "walking" }))).toEqual({});
    expect(reduceLocationEvent(stop(), ev({ kind: "activity_change", detectedActivity: "unknown" }))).toEqual({});
  });
});

describe("reduceLocationEvent — location_update", () => {
  it("fills in a stop's missing address and coords", () => {
    const out = reduceLocationEvent(
      stop(),
      ev({ kind: "location_update", geocodedAddress: "14 Oak St", latitude: 42.1, longitude: -71.2 }),
    );
    expect(out.updateOpen).toEqual({ placeLabel: "14 Oak St", latitude: 42.1, longitude: -71.2 });
  });

  it("does not overwrite an existing label", () => {
    const out = reduceLocationEvent(stop({ placeLabel: "home" }), ev({ kind: "location_update", geocodedAddress: "elsewhere" }));
    expect(out).toEqual({});
  });

  it("is a no-op during a drive", () => {
    const out = reduceLocationEvent(drive(), ev({ kind: "location_update", geocodedAddress: "14 Oak St" }));
    expect(out).toEqual({});
  });
});

describe("reduceLocationEvent — vehicle Bluetooth", () => {
  it("vehicle_connect opens a vehicle-tagged drive", () => {
    const out = reduceLocationEvent(stop({ zone: "home" }), ev({ kind: "vehicle_connect", vehicleId: "veh-ram" }));
    expect(out.closeOpen).toEqual({ endedAt: T2 });
    expect(out.open).toMatchObject({ kind: "drive", vehicleId: "veh-ram", suggestedActivityType: "travel" });
  });

  it("vehicle_connect while already driving just (re)tags the vehicle", () => {
    const out = reduceLocationEvent(drive({ vehicleId: null }), ev({ kind: "vehicle_connect", vehicleId: "veh-gmc" }));
    expect(out.open).toBeUndefined();
    expect(out.updateOpen).toEqual({ vehicleId: "veh-gmc" });
  });

  it("vehicle_connect with the same vehicle already tagged is a no-op", () => {
    const out = reduceLocationEvent(drive({ vehicleId: "veh-ram" }), ev({ kind: "vehicle_connect", vehicleId: "veh-ram" }));
    expect(out).toEqual({});
  });

  it("vehicle_disconnect closes an open drive", () => {
    const out = reduceLocationEvent(drive({ vehicleId: "veh-ram" }), ev({ kind: "vehicle_disconnect" }));
    expect(out.closeOpen).toEqual({ endedAt: T2 });
    expect(out.open).toBeUndefined();
  });

  it("vehicle_disconnect with no open drive is a no-op", () => {
    expect(reduceLocationEvent(stop(), ev({ kind: "vehicle_disconnect" }))).toEqual({});
    expect(reduceLocationEvent(null, ev({ kind: "vehicle_disconnect" }))).toEqual({});
  });
});

describe("a typical morning", () => {
  it("home → drive → supply stop → drive → job stop", () => {
    // leave home
    let out = reduceLocationEvent(stop({ zone: "home" }), ev({ kind: "zone_leave", zone: "home", occurredAt: "2026-06-19T08:00:00Z" }));
    expect(out.open?.kind).toBe("drive");
    // arrive supply house
    out = reduceLocationEvent(drive(), ev({ kind: "zone_enter", zone: "Ferguson", occurredAt: "2026-06-19T08:20:00Z" }));
    expect(out.open).toMatchObject({ kind: "stop", suggestedActivityType: "material_run" });
    // leave supply house (driving) then stop at a customer with no zone
    out = reduceLocationEvent(drive(), ev({ kind: "activity_change", detectedActivity: "still", geocodedAddress: "14 Oak St", occurredAt: "2026-06-19T09:05:00Z" }));
    expect(out.open).toMatchObject({ kind: "stop", placeLabel: "14 Oak St", suggestedActivityType: null });
  });
});
