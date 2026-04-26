# Railway deploy

Projekt se deploya kao dva Railway servisa iz istog GitHub repo-a:

1. Backend servis
   - Root Directory: `/backend`
   - Config file: `/backend/railway.toml`
   - Dodaj PostgreSQL service.
   - Varijable postavi prema `backend/.env.example`.
   - `DATABASE_URL` treba referencirati Railway PostgreSQL varijablu: `${{Postgres.DATABASE_URL}}`.
   - `ADMIN_USERNAME` i `ADMIN_PASSWORD` stvaraju prvog admina.
   - Ako admin vec postoji i treba reset lozinke, privremeno postavi `ADMIN_RESET_PASSWORD=true`, redeployaj backend, prijavi se, pa vrati na `false`.

2. Frontend servis
   - Root Directory: `/frontend`
   - Config file: `/frontend/railway.toml`
   - Varijable postavi prema `frontend/.env.example`.
   - `VITE_API_URL` mora biti javni URL backend servisa s `/api` na kraju.
   - Primjer: `https://adix-backend.up.railway.app/api`

Nakon deploya:

- Otvori frontend Railway URL.
- Prijavi se s vrijednostima iz `ADMIN_USERNAME` i `ADMIN_PASSWORD`.
- U panelu `Radnici` dodaj radnika s rolom `radnik`.
- Na mobitelu se prijavi s tim radnikom i testiraj prijavu kvarova.

Ako promijenis `VITE_API_URL`, frontend se mora redeployati jer Vite varijable ulaze u build.
