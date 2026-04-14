import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { TopSellingVenom } from "@/components/top-selling-venom";
import { VenomCatalog, type PricedVenomProduct } from "@/components/venom-catalog";
import { getVenomProducts, VENOM_SET_ICON_URL } from "@/lib/hcunits";
import { formatPenPrice, getVenomPrice, validateVenomPricing } from "@/lib/venom-pricing";

export default async function Home() {
  const venomProducts = await getVenomProducts();
  const pricing = validateVenomPricing(venomProducts);
  const pricedProducts: PricedVenomProduct[] = pricing.pricedProducts
    .map((product) => ({
      ...product,
      price: getVenomPrice(product.code)!,
    }))
    .sort((left, right) =>
      left.code.localeCompare(right.code, undefined, { numeric: true, sensitivity: "base" }),
    );

  const featuredProducts = [...pricedProducts].sort((left, right) => right.price - left.price).slice(0, 3);
  const lowerPrice = pricedProducts.reduce((lowest, product) => Math.min(lowest, product.price), Number.POSITIVE_INFINITY);
  const higherPrice = featuredProducts[0]?.price ?? 0;
  const normalizedLowerPrice = Number.isFinite(lowerPrice) ? lowerPrice : 0;
  const metrics = [
    { value: `${pricedProducts.length}`, label: "figuras disponibles ahora" },
    {
      value: `${Array.from(new Set(pricedProducts.map((item) => item.rarity))).length}`,
      label: "rarezas distintas en stock",
    },
    { value: `${formatPenPrice(normalizedLowerPrice)} – ${formatPenPrice(higherPrice)}`, label: "rango de precios en soles" },
  ];

  return (
    <main className="relative flex-1 overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-64 bg-[linear-gradient(135deg,rgba(242,174,48,0.24),transparent_55%)]" />
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-10 px-4 py-6 sm:px-6 lg:px-8">
        <section className="panel-glass relative overflow-hidden rounded-[2rem] border border-border/70 shadow-[0_24px_80px_rgba(35,42,61,0.12)]">
          <div className="absolute right-6 top-8 hidden h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(242,174,48,0.22),transparent_68%)] blur-2xl lg:block" />
          <div className="absolute bottom-0 left-0 h-32 w-full bg-[linear-gradient(180deg,transparent,rgba(255,255,255,0.55))]" />
          <div className="relative mx-auto grid max-w-6xl gap-10 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_280px] lg:px-10 lg:py-12">
            <div className="space-y-8">
              <div className="space-y-5">
                <div className="logo-darkplate w-fit rounded-[1.75rem] border border-black/10 px-4 py-3">
                  <Image
                    src="/logo.webp"
                    alt="CholoStuff"
                    width={220}
                    height={138}
                    priority
                    className="logo-knockout"
                    style={{ width: "220px", height: "auto" }}
                    unoptimized
                  />
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-primary text-primary-foreground">Stock disponible</Badge>
                  <Badge variant="outline" className="border-foreground/15 bg-background/70">
                    Precios en soles
                  </Badge>
                  <Badge variant="outline" className="border-foreground/15 bg-background/70">
                    Envíos a todo Perú
                  </Badge>
                </div>

                <div className="space-y-4">
                  <p className="text-sm font-semibold uppercase tracking-[0.3em] text-muted-foreground">
                    CholoStuff
                  </p>
                  <h1 className="display-title max-w-4xl text-5xl leading-[0.92] text-foreground sm:text-6xl xl:text-7xl">
                    HeroClix Venom en soles. Elige tu pieza y cómprala hoy.
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                    Commons, raras, super raras y chase del set Venom con precio fijo en soles. Sin subasta, sin esperar — escoges, consultas y se separa.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <a href="#catalogo-venom">
                  <Button size="lg" className="h-12 rounded-full px-8 text-base">
                    Ver todas las figuras
                  </Button>
                </a>
                <a href="#destacados-venom">
                  <Button size="lg" variant="outline" className="h-12 rounded-full px-8 text-base">
                    Ver piezas premium
                  </Button>
                </a>
              </div>

              <div className="grid gap-3 md:grid-cols-3">
                {metrics.map((item) => (
                  <Card key={item.label} className="border-border/70 bg-background/72 shadow-none">
                    <CardContent className="p-5">
                      <p className="text-3xl font-black text-primary">{item.value}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{item.label}</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>

            <div className="hidden lg:flex lg:flex-col lg:justify-center">
              <div className="rounded-[2rem] border border-border/70 bg-background/72 p-5 shadow-[0_16px_40px_rgba(64,1,1,0.08)]">
                <div className="mx-auto flex h-28 w-28 items-center justify-center rounded-full border border-black/8 bg-white/80 p-5 shadow-[0_18px_40px_rgba(64,1,1,0.12)]">
                  <Image
                    src={VENOM_SET_ICON_URL}
                    alt="Icono oficial del set Venom"
                    width={96}
                    height={96}
                    className="h-auto w-full object-contain"
                    unoptimized
                  />
                </div>
                <div className="mt-5 space-y-3 text-center">
                  <p className="display-title text-3xl leading-none text-foreground">Set Venom</p>
                  <p className="text-sm leading-6 text-muted-foreground">
                    Expansión completa con precio por pieza y rareza confirmada.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="resumen-venom" className="grid gap-4 lg:grid-cols-[0.8fr_1.2fr]">
          <Card className="logo-stage overflow-hidden border-border/70 text-foreground shadow-none">
            <CardHeader className="space-y-3 pb-3">
              <CardDescription>Resumen del set</CardDescription>
              <CardTitle className="display-title text-4xl">¿Qué hay en el set Venom?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div className="rounded-[1.75rem] border border-black/8 bg-white/68 p-5">
                <div className="flex items-center gap-4">
                  <div className="flex h-20 w-20 shrink-0 items-center justify-center rounded-full border border-black/8 bg-background/90 p-4 shadow-[0_18px_40px_rgba(64,1,1,0.12)]">
                    <Image
                      src={VENOM_SET_ICON_URL}
                      alt="Icono oficial del set Venom"
                      width={84}
                      height={84}
                      className="h-auto w-full object-contain"
                      unoptimized
                    />
                  </div>
                  <div className="space-y-1">
                    <p className="display-title text-2xl leading-none text-foreground">Set Venom</p>
                    <p className="text-sm leading-6 text-muted-foreground">
                      Figuras de la expansión Venom con precios fijos. Cada pieza tiene rareza confirmada y foto oficial.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-black/8 bg-white/60 px-4 py-4">
                  <p className="text-sm text-muted-foreground">Desde</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{formatPenPrice(lowerPrice)}</p>
                </div>
                <div className="rounded-2xl border border-black/8 bg-white/60 px-4 py-4">
                  <p className="text-sm text-muted-foreground">Hasta</p>
                  <p className="mt-1 text-2xl font-semibold text-foreground">{formatPenPrice(higherPrice)}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden border-border/70 bg-card/88 shadow-none">
            <CardHeader className="space-y-3 pb-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                <div className="min-w-0">
                  <CardDescription>Lo más buscado</CardDescription>
                  <CardTitle className="text-2xl">Las 3 figuras de mayor valor</CardTitle>
                </div>
                <Badge className="w-fit bg-primary text-primary-foreground">Top 3</Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3">
                {featuredProducts.map((product) => (
                  <div
                    key={`hero-${product.code}`}
                    className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/88 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/30">
                      {product.imageUrl ? (
                        <Image
                          src={product.imageUrl}
                          alt={product.name}
                          fill
                          className="object-contain p-2"
                          unoptimized
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap gap-2 pb-1">
                        <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
                          {product.rarity}
                        </Badge>
                        <Badge variant="outline" className="w-fit rounded-full bg-background/80">
                          {product.category}
                        </Badge>
                      </div>
                      <p className="truncate text-sm font-semibold text-foreground">{product.name}</p>
                      <p className="text-xs text-muted-foreground">{product.code}</p>
                    </div>
                    <div className="shrink-0 text-left sm:text-right">
                      <p className="text-lg font-bold text-primary">{formatPenPrice(product.price)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </section>

        <section id="destacados-venom" className="space-y-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
                Piezas premium
              </p>
              <h2 className="display-title text-4xl leading-none">Las figuras más potentes del set</h2>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
              Chase, super raras y piezas únicas que definen cualquier colección o equipo competitivo. Disponibles con precio fijo.
            </p>
          </div>
          <div className="grid gap-4 md:grid-cols-3">
            {featuredProducts.map((product) => (
              <Card key={product.code} className="overflow-hidden border-border/70 bg-card/88 shadow-none">
                <CardHeader className="gap-3">
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
                      {product.category}
                    </Badge>
                    <Badge variant="outline" className="w-fit rounded-full bg-background/80">
                      {product.rarity}
                    </Badge>
                  </div>
                  <CardTitle className="text-2xl leading-7">{product.name}</CardTitle>
                  <CardDescription>
                    {product.code} · {product.summary}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {product.imageUrl ? (
                    <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                      <Image
                        src={product.imageUrl}
                        alt={product.name}
                        fill
                        className="object-contain p-4"
                        unoptimized
                      />
                    </div>
                  ) : null}
                </CardContent>
                <CardFooter className="justify-between">
                  <span className="text-sm text-muted-foreground">Precio de venta</span>
                  <span className="text-2xl font-black text-primary">{formatPenPrice(product.price)}</span>
                </CardFooter>
              </Card>
            ))}
          </div>
        </section>

        <TopSellingVenom />

        <VenomCatalog products={pricedProducts} />
      </div>
    </main>
  );
}
