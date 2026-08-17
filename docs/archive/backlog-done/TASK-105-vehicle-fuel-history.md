# TASK-105: Vehicle fuel history, MPG, and receipt view

Status:
Done

Phase:
1

Problem:
Fuel fills exist (receipts + vehicle_fuel_logs) but the vehicle page is a log
form. The owner cannot see gallons, $/gal, MPG, or the receipt photo without
leaving the truck.

Business Value:
The Ram becomes a usable fuel log: history first, MPG from full tanks, tap a
row to see the receipt.

Scope:
- Overview API returns fill history joined to expense vendor/amount/receipt, plus last/rolling MPG.
- Vehicle page header: odo, last fill, MPG, 90-day cost.
- Fuel tab: history list first, log form below, receipt modal.

Out of Scope:
- Live GPS, cost charts, field FAB log, attaching new receipt types.

Acceptance Criteria:
- [x] Fuel tab lists fills with date, station, gallons, paid, $/gal, odo, MPG.
- [x] A fill with a receipt opens the photo.
- [x] Header shows last-fill MPG and last-5-fill MPG when two full tanks exist.

Notes:
Shipped: PR #600 (2026-08-15). `VehicleFuelPanel` + overview `recent_fuel`.
Truth-pass archive 2026-08-17.
