# Skill: ai-fsm-access-debug

Use this skill when:

- user says the site is blank or not loading
- health endpoint works but browser does not
- proxy and DNS are both possible causes

## Triage order

1. check app container health
2. fetch HTML through the proxy
3. fetch one `_next` static asset through the proxy
4. verify hostname resolution on the client machine
5. verify browser is hitting the expected host

## Interpretation

- HTML + static assets load from proxy: server path is good
- proxy health works but browser fails: client DNS/hosts/browser issue
- container health works but proxy fails: proxy config issue
- container health fails: app issue
