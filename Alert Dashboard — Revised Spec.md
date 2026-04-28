# Alert Dashboard — Revised Spec

## Alert Types & Rules

| Alert                 | Condition                                                                             | Description                                                      |
| --------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Reservasi Penerbangan | current_time > (ATA Origin + n hours) AND ATD Flight is empty AND ATA Flight is empty | Goods have arrived at origin airport but no flight scheduled yet |
| Potensi Melebihi SLA  | (ATA Flight + m hours) > Max SLA                                                      | Estimated arrival at destination airport exceeds Max SLA         |
| Melewati SLA          | current_time > Max SLA                                                                | Shipment has passed SLA deadline                                 |
| Potensi Melebihi TJPH | Melewati SLA OR (ATA Flight + m hours) > Max TJPH                                     | Shipment passed SLA or estimated arrival exceeds Max TJPH        |
| Melewati TJPH         | current_time > Max TJPH                                                               | Shipment has passed TJPH deadline                                |

### Legend

| Variable | Definition                                                                                  |
| -------- | ------------------------------------------------------------------------------------------- |
| Max SLA  | ATA Origin + SLA Time                                                                       |
| Max TJPH | ATA Origin + TJPH Time                                                                      |
| n hours  | Estimated travel time from origin warehouse to origin airport (user-configurable)           |
| m hours  | Estimated travel time from destination airport to destination warehouse (user-configurable) |

---

## UI Behavior

### Alert Cards

- Each alert type is displayed as a card
- Card shows:
  - Alert label
  - Total routes affected
  - Total tonnage affected

### Card Expand (click card)

- Card expands to show a list of routes under that alert
- Each route shows its total tonnage

### Route Click (click route inside expanded card)

- Directly filters the shipment table by the selected alert + selected route

---

## User-Configurable Parameters

Two parameters can be adjusted by the user (via UI input):

1. **n hours** — estimated travel time from origin warehouse to origin airport
2. **m hours** — estimated travel time from destination airport to destination warehouse

These values affect the alert rule calculations in real-time.
