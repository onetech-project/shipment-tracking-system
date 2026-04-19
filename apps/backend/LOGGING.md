Backend logging (NestJS + pino)

Summary

- The backend uses `pino` for structured JSON logs and `rotating-file-stream` for daily file rotation.
- Logs are written to stdout (console) and to a rotating file at `apps/backend/logs/app.log`.

Rotation

- Active file: `apps/backend/logs/app.log`.
- Rotated files: `app-YYYY-MM-DD.log` (gzipped), produced daily by the rotating stream.

Quick commands

```bash
# list log files
ls -la apps/backend/logs

# view the last 200 lines of the active log
tail -n 200 apps/backend/logs/app.log

# follow logs live
tail -f apps/backend/logs/app.log
```

Where to look in code

- Logger setup: `apps/backend/src/common/logging/app-logger.service.ts`

Change rotation/retention

- Edit the rotating-file-stream options in the AppLogger service to change filename pattern, frequency, and maxSize.
- For OS-level retention, you can use `logrotate` to manage older files and retention policies.

Prometheus / metrics

- Prometheus metrics are not yet implemented. Recommended approach: add `prom-client`, instrument key services, and expose a `/metrics` endpoint (or integrate with NestJS instrumentation modules).

Notes for PR

- Include this doc and a short README snippet describing log location and how to view logs.

Contact

- If you want, I can add a `metrics` doc next or wire a `/metrics` endpoint.
