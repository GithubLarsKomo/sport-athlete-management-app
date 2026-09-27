# Coach access operations

Coach access is application authorization layered behind the existing Authentik identity boundary.

## Trust boundary

- Authentik authenticates the stable user subject.
- The application database owns the application role: `athlete | coach`.
- A Coach never receives global athlete access.
- Every Coach request for athlete-scoped data must carry the selected athlete as `x-sam-target-athlete`.
- That header is only a target selector. It is never trusted as authorization; the server checks an active Coach↔Athlete assignment before reading or writing athlete data.
- Every permitted cross-athlete API action creates a `coach.api_access` audit event.

Existing unknown Authentik subjects continue to self-provision as Athletes for backward compatibility. Coach principals are provisioned only by an operator.

## Grant access

After migrations are applied and the athlete exists:

```bash
npm run coach:access -- grant <authentik-coach-subject> <athlete-id> "Coach display name"
```

The command:
1. creates or refreshes a Coach principal;
2. refuses to silently convert an existing Athlete principal into a Coach;
3. creates an active assignment if none exists;
4. records operator/audit evidence.

## Revoke access

```bash
npm run coach:access -- revoke <authentik-coach-subject> <athlete-id>
```

Revocation closes the active assignment interval. The prior assignment row remains as history and subsequent athlete-scoped requests are denied.

## UI behavior

A Coach sees an explicit **Aktueller Athlet** selector populated only with active assignments. The selection is carried in the page URL and sent as the target header for athlete-scoped API requests.

Athlete users do not see the selector and remain scoped to their own athlete record.

## Production notes

- Run operator commands only from a trusted administrative shell with the production `DATABASE_URL`.
- Do not expose Coach-principal or assignment mutation as a public endpoint in v1.
- Do not add a generic Authentik group-to-global-access shortcut.
