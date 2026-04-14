"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPenPrice, getVenomPrice } from "@/lib/venom-pricing";

type TopSellingRow = {
  approved_tickets: number;
  category: string;
  image_url: string | null;
  product_code: string;
  product_name: string;
  rarity: string;
  total_units: number;
  unit_price: number;
};

export function TopSellingVenom() {
  const [items, setItems] = useState<TopSellingRow[]>([]);
  const [status, setStatus] = useState<"loading" | "ready" | "hidden">("loading");

  useEffect(() => {
    let isCancelled = false;

    async function loadTopSelling() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setStatus("hidden");
        return;
      }

      const { data, error } = await supabase.rpc("get_top_selling_venom_products", { p_limit: 6 });

      if (isCancelled) {
        return;
      }

      if (error || !Array.isArray(data) || data.length === 0) {
        setStatus("hidden");
        return;
      }

      setItems(data as TopSellingRow[]);
      setStatus("ready");
    }

    void loadTopSelling();

    return () => {
      isCancelled = true;
    };
  }, []);

  if (status === "hidden") {
    return null;
  }

  return (
    <section className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
            Más vendidas
          </p>
          <h2 className="display-title text-4xl leading-none">Las fichas más vendidas</h2>
        </div>
        <p className="max-w-2xl text-sm leading-6 text-muted-foreground">
          Una selección dinámica con las piezas que más movimiento vienen teniendo, ideal para detectar las que más llaman la atención.
        </p>
      </div>

      {status === "loading" ? (
        <Card className="border-border/70 bg-card/88 shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">Cargando fichas más vendidas...</CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((item, index) => (
            <Card key={item.product_code} className="overflow-hidden border-border/70 bg-card/88 shadow-none">
              <CardHeader className="gap-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge className="bg-primary text-primary-foreground">#{index + 1}</Badge>
                      <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
                        {item.category}
                      </Badge>
                      <Badge variant="outline" className="w-fit rounded-full bg-background/80">
                        {item.rarity}
                      </Badge>
                    </div>
                    <CardTitle className="text-2xl leading-7">{item.product_name}</CardTitle>
                  </div>
                  <Badge variant="outline" className="rounded-full bg-background/80 font-mono text-xs">
                    {item.product_code}
                  </Badge>
                </div>
                <CardDescription>{formatPenPrice(getVenomPrice(item.product_code) ?? item.unit_price)}</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {item.image_url ? (
                  <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                    <Image
                      src={item.image_url}
                      alt={item.product_name}
                      fill
                      className="object-contain p-3"
                      unoptimized
                    />
                  </div>
                ) : null}

                <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3">
                  <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Señal de demanda</p>
                  <p className="mt-1 text-sm font-semibold text-foreground">
                    Pieza con alta rotación dentro de la tienda.
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </section>
  );
}