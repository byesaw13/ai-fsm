# Workflow States Contract

## Job
`draft -> quoted -> scheduled -> in_progress -> completed -> invoiced`

## Visit
`scheduled -> arrived -> in_progress -> completed` (+ `cancelled`)

## Estimate
`draft -> sent -> approved|declined|expired`

## Invoice
`draft -> sent -> partial|paid|overdue|void`
