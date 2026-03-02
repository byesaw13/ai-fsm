# Skill: ai-fsm-release-sync

Use this skill when code has merged and the running deployment must be updated.

## Inputs

- merged commit or PR number
- target host
- whether migrations are required

## Release sequence

1. confirm merge landed on `origin/main`
2. confirm target host checkout points to the same repo
3. pull latest `main`
4. run only required migration step
5. rebuild/restart affected services
6. run smoke checks at the correct boundary

## Output

Return:

1. merged commit
2. exact host commands
3. migration required: yes/no
4. smoke test result
