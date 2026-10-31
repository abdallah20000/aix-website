# AIX website

Public site (index.html) and team tools behind Team Login:

- crm.html: login + CRM (leads, follow-ups)
- inventory.html: stock-take and stock moves
- installs.html: installations, parts taken from stock, before/after photos
- home.html: customer login (email + password) and smart-home dashboard. Each account is linked to the customer's Home Assistant (URL + long-lived token, saved on the account); Tuya devices come in through Home Assistant's Tuya integration. Buttons, readings with 24h charts, typed and voice commands (Arabic).

Data lives in Supabase; access is by role in the team_members table.

Pushes to main deploy automatically to aixegypt.com via Netlify.
