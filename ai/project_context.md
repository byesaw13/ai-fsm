# Project Context: Dovetails FSM

## 1. Product Identity & Purpose
Dovetails FSM is a residential handyman and home maintenance operating system. It manages the entire workflow of Dovetails Services LLC—from initial lead intake through estimating, execution, billing, and permanent property history.

The absolute center of the product is the **Property**. Clients, jobs, visits, estimates, invoices, and observation history are durable records tied to the physical service location (home), not scattered across transient entities.

## 2. Business Goals & Scope
- **Traceable Property Records**: Accumulate every visit, technician note, equipment type, paint color, and client approval into a permanent maintenance timeline for the home.
- **Accurate & Guardrailed Estimating**: Create standardized estimates with margin protections using a structured price book.
- **Simplified Operations**: Keep field coordination clear, providing technicians on-site with notes, checklists, materials, and photos.
- **Calm, Solo-Operator Workflows**: Designed for a small residential contractor (owner/admin and 1-2 technicians/helpers). No heavy SaaS overhead or complex routing algorithms.

## 3. Core Workflow
```text
Lead/Intake -> Client -> Property -> Estimate -> Job -> Visit -> Invoice -> Timeline/History
```

## 4. Primary Users
- **Owner/Admin**: Manages intake, prices work, reviews estimates, schedules visits, approves invoices, and monitors margins.
- **Office/Admin**: Handles client follow-ups, coordinates booking requests, and processes invoice payments.
- **Technician**: Operates in the field, views assigned visits, registers notes/photos/materials on-site, and submits completion packets.
