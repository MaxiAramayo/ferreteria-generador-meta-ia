# Worker

Proceso separado para:

- generación de recursos con OpenAI;
- render determinístico con Playwright;
- programación y publicación;
- reintentos y reconciliación.

PostgreSQL conserva el estado de negocio. La cola no sustituye a la base.
