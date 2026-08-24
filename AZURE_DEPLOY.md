# Deploying this backend to Azure

This is a long-running **Node/Express + Socket.IO server**. It must be deployed
to **Azure App Service** — NOT Azure Static Web Apps (that product hosts static
HTML/JS files and will always fail with "unable to determine the location of
the app artifacts" for this repo).

## One-time setup (Azure portal)

1. **Delete any Static Web App resources** created for this repo, so they stop
   re-adding a broken workflow file.

2. **Create the Web App**
   - Portal → Create a resource → **Web App**
   - Publish: **Code** · Runtime stack: **Node 20 LTS** · OS: **Linux**
   - Pick region/plan (B1 or F1 is fine to start) → Create

3. **Connect GitHub (Deployment Center)**
   - Open the Web App → **Deployment Center**
   - Source: **GitHub** → repo `codinginfotech/parking_management_backend`,
     branch `main` → Save
   - Azure commits a *correct* Node workflow to the repo and wires up
     credentials automatically. Every push to `main` now deploys.

4. **Application settings** (Web App → Environment variables → App settings).
   Add each of these — the server refuses to boot without the required ones:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | `mysql://verto84f_ayaanpathan:<PASSWORD-URL-ENCODED>@vertowork.com:3306/verto84f_parking_management` |
   | `JWT_SECRET` | long random string |
   | `JWT_REFRESH_SECRET` | different long random string |
   | `JWT_ACCESS_EXPIRES_IN` | `15m` |
   | `JWT_REFRESH_EXPIRES_IN` | `30d` |
   | `CORS_ORIGIN` | `*` |
   | `TIMEZONE_OFFSET_MINUTES` | `330` |
   | `GOOGLE_CLIENT_ID` | (empty until Google OAuth is configured) |
   | `SCM_DO_BUILD_DURING_DEPLOYMENT` | `true` |

   Note: URL-encode special characters in the DB password (`@` → `%40`).
   Do NOT set `PORT` — App Service injects it and the server reads it.

5. **Enable WebSockets** (required for Socket.IO realtime)
   - Web App → Configuration → General settings → **Web sockets: On**
   - While there, set **Always On: On** if your plan supports it.

6. Verify: open `https://<your-app>.azurewebsites.net/health` — expect
   `{"success":true,"message":"OK",...}`.

## Notes

- The Prisma client is generated during `npm install` (postinstall) and the
  schema declares Linux binary targets, so builds work on Azure's Linux images.
- Startup is the default `npm start` → `node dist/server.js`; `npm run build`
  (tsc) runs during deployment because `SCM_DO_BUILD_DURING_DEPLOYMENT=true`.
- The MySQL host must allow remote connections from Azure's IPs — the `%`
  access host in cPanel → Remote MySQL® covers this.
