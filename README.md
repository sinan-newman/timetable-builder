# Department Timetable Builder

An interactive, client-side department timetable generator with constraint-based scheduling, simulated annealing optimization, and even period distribution.

🔗 **Live Web App**: [https://sinan-newman.github.io/timetable-builder/](https://sinan-newman.github.io/timetable-builder/)

---

## ✨ Features

- **Department Setup**:
  - Configurable working days (1–7) and periods per day (1–12).
  - Custom day names.
- **Classes Management**:
  - Daily hour requirements per class.
  - Per-class strict maximum hours for any single teacher (`Max/t/day`).
  - Period pinning ("Choose" specific meeting periods).
- **Teacher Exceptions in Classes**:
  - Custom override limits for specific teacher-class pairs (e.g., allowing a teacher with 8 hours in a class to take up to 2 hours/day while others remain capped at 1).
- **Teachers Configuration**:
  - Auto-generated short codes (editable).
  - Subject tags.
  - Strict daily hours cap per teacher (`Max/day`).
- **Teaching Hours Allocation**:
  - Interactive matrix allocating hours per teacher across classes with auto totals.
- **Strict Constraints**:
  - Zero teacher double-booking.
  - Strict maximum hours per class per day (with exceptions).
  - Strict daily maximum and minimum hours per teacher.
  - Strict maximum continuous hours without breaks (`optMaxRun`).
  - Strict condition forbidding P1, P2, and P3 scheduled together on the same day (`optNoP123`).
- **Fairness & Balancing**:
  - Spreads each teacher's teaching load evenly across all period slots (P1..P5) throughout the week ($W_{\text{EVEN}}$).
  - Period Balance report with out-of-band highlighting.
- **Exporting & Persistence**:
  - Class view, Teacher view, and Master schedule view.
  - PDF export (landscape with conflict outlining).
  - CSV export.
  - Print styling.
  - Browser auto-save (`localStorage`).
