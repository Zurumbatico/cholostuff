# CholoStuff

Prototipo de tienda online para figuras HeroClix construido con Next.js, Tailwind CSS v4 y shadcn/ui.

## Stack

- Next.js 16 con App Router
- TypeScript
- Tailwind CSS v4
- shadcn/ui
- pnpm

## Desarrollo

```bash
pnpm dev
```

Abre `http://localhost:3000` para ver el prototipo.

## Estado actual

- Home temática para store de HeroClix
- Scraping server-side del set Venom desde HCUnits
- Catálogo renderizado con los 111 productos de la expansión Venom
- Componentes base de shadcn/ui configurados
- Estructura lista para escalar a catálogo, carrito y checkout

## Siguientes pasos naturales

1. Conectar productos reales desde JSON, CMS o base de datos.
2. Añadir navegación, página de catálogo y detalle de producto.
3. Integrar carrito y flujo de checkout.
