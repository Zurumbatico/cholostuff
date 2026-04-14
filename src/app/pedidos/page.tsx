"use client";

import { useEffect, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPenPrice } from "@/lib/venom-pricing";

const INVENTORY_PAGE_SIZE = 12;

type OrderItem = {
  category: string;
  id: number;
  image_url: string | null;
  line_total: number;
  product_code: string;
  product_name: string;
  quantity: number;
  rarity: string;
  unit_price: number;
};

type OrderRequest = {
  approved_at: string | null;
  cart_id: string | null;
  created_at: string;
  customer_name: string | null;
  customer_notes: string | null;
  customer_phone: string | null;
  id: string;
  order_request_items: OrderItem[];
  rejected_at: string | null;
  status: "pending_approval" | "approved" | "rejected" | "cancelled";
  total_amount: number;
  total_items: number;
};

function formatOrderDate(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatOrderDateOnly(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    dateStyle: "medium",
  }).format(new Date(value));
}

function formatOrderTimeOnly(value: string) {
  return new Intl.DateTimeFormat("es-PE", {
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(status: OrderRequest["status"]) {
  if (status === "pending_approval") return "Pendiente";
  if (status === "approved") return "Aprobado";
  if (status === "rejected") return "Rechazado";
  return "Cancelado";
}

function statusVariant(status: OrderRequest["status"]) {
  if (status === "approved") return "secondary" as const;
  if (status === "rejected") return "destructive" as const;
  return "outline" as const;
}

function buildPageWindow(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const normalizedStart = Math.max(1, end - 4);

  return Array.from({ length: end - normalizedStart + 1 }, (_, index) => normalizedStart + index);
}

async function fetchOrdersData() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      errorMessage: "Supabase no está configurado en el navegador.",
      orders: [] as OrderRequest[],
    };
  }

  const { data, error } = await supabase
    .from("order_requests")
    .select(
      "id, cart_id, customer_name, customer_phone, customer_notes, status, total_amount, total_items, created_at, approved_at, rejected_at, order_request_items(id, product_code, product_name, image_url, category, rarity, quantity, unit_price, line_total)",
    )
    .order("created_at", { ascending: false });

  if (error) {
    return {
      errorMessage: "No se pudieron cargar los tickets.",
      orders: [] as OrderRequest[],
    };
  }

  return {
    errorMessage: null,
    orders: (data ?? []) as OrderRequest[],
  };
}

type InventoryRow = {
  available_quantity: number;
  created_at: string;
  image_url: string | null;
  is_active: boolean;
  product_code: string;
  product_name: string;
  reserved_quantity: number;
  updated_at: string;
};

async function fetchInventoryData() {
  const supabase = getSupabaseBrowserClient();

  if (!supabase) {
    return {
      errorMessage: "Supabase no está configurado en el navegador.",
      inventory: [] as InventoryRow[],
    };
  }

  const { data, error } = await supabase
    .from("product_inventory")
    .select("product_code, product_name, image_url, available_quantity, reserved_quantity, is_active, created_at, updated_at")
    .order("product_name", { ascending: true });

  if (error) {
    return {
      errorMessage: "No se pudo cargar el stock.",
      inventory: [] as InventoryRow[],
    };
  }

  return {
    errorMessage: null,
    inventory: (data ?? []) as InventoryRow[],
  };
}

export default function PedidosPage() {
  const [orders, setOrders] = useState<OrderRequest[]>([]);
  const [inventory, setInventory] = useState<InventoryRow[]>([]);
  const [activeView, setActiveView] = useState<"tickets" | "stock">("tickets");
  const [isLoading, setIsLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [authStatus, setAuthStatus] = useState<"loading" | "authenticated" | "unauthenticated">("loading");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [stockLookup, setStockLookup] = useState("");
  const [stockQuantity, setStockQuantity] = useState("0");
  const [isSavingStock, setIsSavingStock] = useState(false);
  const [inventorySearch, setInventorySearch] = useState("");
  const [inventoryPage, setInventoryPage] = useState(1);
  const [pendingStockItem, setPendingStockItem] = useState<InventoryRow | null>(null);

  const normalizedInventorySearch = inventorySearch.trim().toLowerCase();
  const filteredInventory = inventory.filter((item) => {
    if (!normalizedInventorySearch) {
      return true;
    }

    const searchableText = `${item.product_name} ${item.product_code}`.toLowerCase();
    return searchableText.includes(normalizedInventorySearch);
  });
  const totalInventoryPages = Math.max(1, Math.ceil(filteredInventory.length / INVENTORY_PAGE_SIZE));
  const effectiveInventoryPage = Math.min(inventoryPage, totalInventoryPages);
  const inventoryStartIndex = (effectiveInventoryPage - 1) * INVENTORY_PAGE_SIZE;
  const paginatedInventory = filteredInventory.slice(
    inventoryStartIndex,
    inventoryStartIndex + INVENTORY_PAGE_SIZE,
  );
  const inventoryPageWindow = buildPageWindow(effectiveInventoryPage, totalInventoryPages);
  const normalizedStockLookup = stockLookup.trim().toLowerCase();
  const matchedStockItem = normalizedStockLookup
    ? inventory.find((item) => item.product_code.toLowerCase() === normalizedStockLookup) ??
      inventory.find((item) => item.product_name.toLowerCase() === normalizedStockLookup) ??
      inventory.find((item) =>
        `${item.product_code} ${item.product_name}`.toLowerCase().includes(normalizedStockLookup),
      ) ??
      null
    : null;

  useEffect(() => {
    const supabaseClient = getSupabaseBrowserClient();

    if (!supabaseClient) {
      queueMicrotask(() => {
        setAuthStatus("unauthenticated");
      });
      return;
    }

    const activeSupabase = supabaseClient;

    let isCancelled = false;

    async function hydrateAuth() {
      const { data } = await activeSupabase.auth.getSession();

      if (isCancelled) {
        return;
      }

      if (data.session?.user) {
        setAuthStatus("authenticated");
        setAuthUserEmail(data.session.user.email ?? "Usuario autorizado");
      } else {
        setAuthStatus("unauthenticated");
        setAuthUserEmail(null);
      }
    }

    void hydrateAuth();

    const {
      data: { subscription },
    } = activeSupabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthStatus("authenticated");
        setAuthUserEmail(session.user.email ?? "Usuario autorizado");
        setAuthMessage(null);
      } else {
        setAuthStatus("unauthenticated");
        setAuthUserEmail(null);
        setOrders([]);
      }
    });

    return () => {
      isCancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  async function loadOrders() {
    if (authStatus !== "authenticated") {
      return;
    }

    setIsLoading(true);
    const result = await fetchOrdersData();
    setOrders(result.orders);
    setActionMessage(result.errorMessage);
    setIsLoading(false);
  }

  async function loadInventory() {
    if (authStatus !== "authenticated") {
      return;
    }

    const result = await fetchInventoryData();
    setInventory(result.inventory);

    if (result.errorMessage) {
      setActionMessage(result.errorMessage);
    }
  }

  useEffect(() => {
    if (authStatus !== "authenticated") {
      return;
    }

    let isCancelled = false;

    async function loadInitialOrders() {
      setIsLoading(true);
      const [ordersResult, inventoryResult] = await Promise.all([fetchOrdersData(), fetchInventoryData()]);

      if (isCancelled) {
        return;
      }

      setOrders(ordersResult.orders);
      setInventory(inventoryResult.inventory);
      setActionMessage(ordersResult.errorMessage ?? inventoryResult.errorMessage);
      setIsLoading(false);
    }

    void loadInitialOrders();

    return () => {
      isCancelled = true;
    };
  }, [authStatus]);

  async function handleSignIn() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      setAuthMessage("Supabase no está configurado en el navegador.");
      return;
    }

    setIsAuthenticating(true);
    setAuthMessage(null);

    const { error } = await supabase.auth.signInWithPassword({
      email: authEmail,
      password: authPassword,
    });

    if (error) {
      setAuthMessage("No se pudo iniciar sesión. Verifica el usuario creado en Supabase.");
      setIsAuthenticating(false);
      return;
    }

    setAuthPassword("");
    setIsAuthenticating(false);
  }

  async function handleSignOut() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    await supabase.auth.signOut();
  }

  async function updateStock() {
    const supabase = getSupabaseBrowserClient();

    if (!supabase || authStatus !== "authenticated" || !pendingStockItem) {
      return;
    }

    setIsSavingStock(true);
    setActionMessage(null);

    const quantity = Number.parseInt(stockQuantity, 10);

    const nextQuantity = Number.isNaN(quantity) ? 0 : quantity;
    const { error } = await supabase
      .from("product_inventory")
      .update({
        available_quantity: nextQuantity,
      })
      .eq("product_code", pendingStockItem.product_code);

    if (error) {
      setActionMessage("No se pudo actualizar el stock.");
      setIsSavingStock(false);
      return;
    }

    setActionMessage(`Stock actualizado para ${pendingStockItem.product_name}.`);
    setStockLookup("");
    setStockQuantity("0");
    setPendingStockItem(null);
    setIsSavingStock(false);
    await loadInventory();
  }

  async function approveOrder(orderId: string) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    setActingId(orderId);
    setActionMessage(null);

    const { error } = await supabase.rpc("approve_order_request", { p_order_id: orderId });

    if (error) {
      setActionMessage("No se pudo aprobar el ticket. Revisa stock e inventario.");
      setActingId(null);
      return;
    }

    setActionMessage("Ticket aprobado y stock descontado.");
    setActingId(null);
    await loadOrders();
  }

  async function rejectOrder(orderId: string) {
    const supabase = getSupabaseBrowserClient();

    if (!supabase) {
      return;
    }

    const reason = window.prompt("Motivo del rechazo", "Sin stock o pedido inválido") ?? "";
    setActingId(orderId);
    setActionMessage(null);

    const { error } = await supabase.rpc("reject_order_request", {
      p_order_id: orderId,
      p_reason: reason,
    });

    if (error) {
      setActionMessage("No se pudo rechazar el ticket.");
      setActingId(null);
      return;
    }

    setActionMessage("Ticket rechazado.");
    setActingId(null);
    await loadOrders();
  }

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <section className="panel-glass rounded-[2rem] border border-border/70 px-6 py-6 shadow-[0_20px_70px_rgba(35,42,61,0.1)]">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Pedidos
            </p>
            <h1 className="display-title text-5xl leading-none">Panel de tickets y stock</h1>
            {authStatus === "authenticated" && authUserEmail ? (
              <p className="mt-2 text-sm text-muted-foreground">Sesión: {authUserEmail}</p>
            ) : null}
          </div>
          <div className="flex flex-wrap gap-2">
            {authStatus === "authenticated" ? (
              <>
                <Button
                  type="button"
                  variant={activeView === "tickets" ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setActiveView("tickets")}
                >
                  Tickets
                </Button>
                <Button
                  type="button"
                  variant={activeView === "stock" ? "default" : "outline"}
                  className="rounded-full"
                  onClick={() => setActiveView("stock")}
                >
                  Stock
                </Button>
                {activeView === "tickets" ? (
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => void loadOrders()}>
                    Actualizar lista
                  </Button>
                ) : (
                  <Button type="button" variant="outline" className="rounded-full" onClick={() => void loadInventory()}>
                    Actualizar inventario
                  </Button>
                )}
                <Button type="button" variant="outline" className="rounded-full" onClick={() => void handleSignOut()}>
                  Salir
                </Button>
              </>
            ) : null}
          </div>
        </div>
        <p className="mt-4 max-w-3xl text-sm leading-6 text-muted-foreground">
          La tienda es pública, pero esta vista de tickets solo debe usarse con un usuario autenticado de Supabase.
        </p>
        {actionMessage ? (
          <div className="mt-4 rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
            {actionMessage}
          </div>
        ) : null}
      </section>

      {authStatus !== "authenticated" ? (
        <Card className="border-border/70 bg-card/88 shadow-none">
          <CardHeader>
            <CardTitle className="text-2xl">Inicia sesión para ver tickets</CardTitle>
            <CardDescription>Usa el usuario que creaste en Supabase Auth.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Correo</p>
              <Input
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                className="h-11 rounded-2xl bg-background px-4"
                placeholder="tu-correo@dominio.com"
              />
            </div>
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">Contraseña</p>
              <Input
                type="password"
                value={authPassword}
                onChange={(event) => setAuthPassword(event.target.value)}
                className="h-11 rounded-2xl bg-background px-4"
                placeholder="Tu contraseña"
              />
            </div>
            {authMessage ? (
              <div className="rounded-2xl border border-border/70 bg-background/80 px-4 py-3 text-sm text-muted-foreground">
                {authMessage}
              </div>
            ) : null}
            <Button
              type="button"
              size="lg"
              className="rounded-full"
              disabled={isAuthenticating || !authEmail || !authPassword}
              onClick={() => void handleSignIn()}
            >
              {isAuthenticating ? "Ingresando..." : "Ingresar"}
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {authStatus === "authenticated" && activeView === "stock" ? (
        <section className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
          <Card className="border-border/70 bg-card/88 shadow-none">
            <CardHeader>
              <CardDescription>Gestión de stock</CardDescription>
              <CardTitle className="text-2xl">Actualizar inventario existente</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Código o nombre</p>
                <Input
                  value={stockLookup}
                  onChange={(event) => setStockLookup(event.target.value)}
                  className="h-11 rounded-2xl bg-background px-4"
                  placeholder="ve047a o Agony"
                />
              </div>
              {matchedStockItem ? (
                <div className="rounded-2xl border border-border/70 bg-background/80 p-3">
                  <div className="flex items-center gap-3">
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                      {matchedStockItem.image_url ? (
                        <Image
                          src={matchedStockItem.image_url}
                          alt={matchedStockItem.product_name}
                          fill
                          className="object-contain p-2"
                          unoptimized
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{matchedStockItem.product_name}</p>
                      <p className="text-xs text-muted-foreground">{matchedStockItem.product_code}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Stock actual: {matchedStockItem.available_quantity}
                      </p>
                    </div>
                  </div>
                </div>
              ) : stockLookup.trim() ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                  No se encontró un item con ese código o nombre.
                </div>
              ) : null}
              <div className="space-y-2">
                <p className="text-sm font-medium text-foreground">Nuevo stock disponible</p>
                <Input
                  type="number"
                  min="0"
                  value={stockQuantity}
                  onChange={(event) => setStockQuantity(event.target.value)}
                  className="h-11 rounded-2xl bg-background px-4"
                />
              </div>
            </CardContent>
            <CardFooter className="justify-between gap-3">
              <p className="text-xs text-muted-foreground">
                Busca el item por código o nombre y confirma antes de cambiar el valor actual.
              </p>
              <Button
                type="button"
                className="rounded-full"
                disabled={isSavingStock || !matchedStockItem || stockQuantity.trim() === ""}
                onClick={() => setPendingStockItem(matchedStockItem)}
              >
                {isSavingStock ? "Guardando..." : "Actualizar stock"}
              </Button>
            </CardFooter>
          </Card>

          <Card className="border-border/70 bg-card/88 shadow-none">
            <CardHeader>
              <CardDescription>Inventario actual</CardDescription>
              <CardTitle className="text-2xl">Stock cargado en Supabase</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="space-y-3 rounded-2xl border border-border/70 bg-background/70 p-4">
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                  <div className="space-y-2">
                    <p className="text-sm font-medium text-foreground">Buscar en stock</p>
                    <Input
                      value={inventorySearch}
                      onChange={(event) => {
                        setInventorySearch(event.target.value);
                        setInventoryPage(1);
                      }}
                      className="h-11 rounded-2xl bg-card px-4 lg:w-[320px]"
                      placeholder="Ej. spider, ve001, carnage"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <span>Resultados: {filteredInventory.length}</span>
                    <span>Página: {effectiveInventoryPage}/{totalInventoryPages}</span>
                    {inventorySearch ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 rounded-full px-3"
                        onClick={() => {
                          setInventorySearch("");
                          setInventoryPage(1);
                        }}
                      >
                        Limpiar
                      </Button>
                    ) : null}
                  </div>
                </div>
              </div>

              {inventory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  Todavía no hay items con stock configurado.
                </div>
              ) : filteredInventory.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border bg-background/70 px-4 py-6 text-sm text-muted-foreground">
                  No hay items que coincidan con esa búsqueda.
                </div>
              ) : (
                paginatedInventory.map((item) => (
                  <div
                    key={item.product_code}
                    className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-3 sm:flex-row sm:items-center"
                  >
                    <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                      {item.image_url ? (
                        <Image
                          src={item.image_url}
                          alt={item.product_name}
                          fill
                          className="object-contain p-2"
                          unoptimized
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-semibold text-foreground">{item.product_name}</p>
                      <p className="text-xs text-muted-foreground">{item.product_code}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Badge variant="outline" className="rounded-full bg-background/80">
                        Disponible: {item.available_quantity}
                      </Badge>
                      <Badge variant="outline" className="rounded-full bg-background/80">
                        Reservado: {item.reserved_quantity}
                      </Badge>
                    </div>
                  </div>
                ))
              )}

              {filteredInventory.length > 0 ? (
                <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-muted-foreground">
                    Mostrando {inventoryStartIndex + 1}-
                    {Math.min(inventoryStartIndex + INVENTORY_PAGE_SIZE, filteredInventory.length)} de {filteredInventory.length} items.
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setInventoryPage((page) => Math.max(1, page - 1))}
                      disabled={effectiveInventoryPage === 1}
                    >
                      Anterior
                    </Button>
                    {inventoryPageWindow.map((pageNumber) => (
                      <Button
                        key={pageNumber}
                        type="button"
                        variant={pageNumber === effectiveInventoryPage ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => setInventoryPage(pageNumber)}
                      >
                        {pageNumber}
                      </Button>
                    ))}
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      onClick={() => setInventoryPage((page) => Math.min(totalInventoryPages, page + 1))}
                      disabled={effectiveInventoryPage === totalInventoryPages}
                    >
                      Siguiente
                    </Button>
                  </div>
                </div>
              ) : null}
            </CardContent>
          </Card>
        </section>
      ) : null}

      {authStatus === "authenticated" && activeView === "tickets" && isLoading ? (
        <Card className="border-border/70 bg-card/88 shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">Cargando tickets...</CardContent>
        </Card>
      ) : authStatus === "authenticated" && activeView === "tickets" && orders.length === 0 ? (
        <Card className="border-border/70 bg-card/88 shadow-none">
          <CardContent className="p-6 text-sm text-muted-foreground">
            Todavía no hay tickets creados. Cuando compres desde el carrito aparecerán aquí.
          </CardContent>
        </Card>
      ) : authStatus === "authenticated" && activeView === "tickets" ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {orders.map((order) => (
            <Card key={order.id} className="overflow-hidden border-border/70 bg-card/88 shadow-none">
              <CardHeader className="gap-3">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <CardDescription>Ticket</CardDescription>
                    <CardTitle className="text-2xl leading-7">{order.id}</CardTitle>
                  </div>
                  <Badge variant={statusVariant(order.status)} className="rounded-full">
                    {statusLabel(order.status)}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Fecha creación</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatOrderDateOnly(order.created_at)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Hora creación</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatOrderTimeOnly(order.created_at)}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Creado</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{formatOrderDate(order.created_at)}</p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span>Piezas: {order.total_items}</span>
                  <span>Total: {formatPenPrice(order.total_amount)}</span>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Cliente</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{order.customer_name ?? "Sin nombre"}</p>
                  </div>
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">Teléfono</p>
                    <p className="mt-1 text-sm font-semibold text-foreground">{order.customer_phone ?? "Sin teléfono"}</p>
                  </div>
                </div>

                {order.customer_notes ? (
                  <div className="rounded-2xl border border-border/70 bg-background/70 px-4 py-3 text-sm text-muted-foreground">
                    {order.customer_notes}
                  </div>
                ) : null}

                <div className="space-y-3">
                  {order.order_request_items.map((item) => (
                    <div
                      key={item.id}
                      className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-background/80 p-3 sm:flex-row sm:items-center"
                    >
                      <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                        {item.image_url ? (
                          <Image
                            src={item.image_url}
                            alt={item.product_name}
                            fill
                            className="object-contain p-2"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap gap-2 pb-1">
                          <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
                            {item.category}
                          </Badge>
                          <Badge variant="outline" className="w-fit rounded-full bg-background/80">
                            {item.rarity}
                          </Badge>
                        </div>
                        <p className="text-sm font-semibold text-foreground">{item.product_name}</p>
                        <p className="text-xs text-muted-foreground">{item.product_code} · Cantidad {item.quantity}</p>
                      </div>
                      <div className="text-left sm:text-right">
                        <p className="text-xs text-muted-foreground">Subtotal</p>
                        <p className="text-base font-bold text-primary">{formatPenPrice(item.line_total)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="justify-between gap-3">
                <div className="text-xs text-muted-foreground">
                  {order.approved_at ? `Aprobado: ${formatOrderDate(order.approved_at)}` : null}
                  {order.rejected_at ? `Rechazado: ${formatOrderDate(order.rejected_at)}` : null}
                  {!order.approved_at && !order.rejected_at ? "Pendiente de revisión" : null}
                </div>
                {order.status === "pending_approval" ? (
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      className="rounded-full"
                      disabled={actingId === order.id}
                      onClick={() => void approveOrder(order.id)}
                    >
                      Aprobar
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      className="rounded-full"
                      disabled={actingId === order.id}
                      onClick={() => void rejectOrder(order.id)}
                    >
                      Rechazar
                    </Button>
                  </div>
                ) : null}
              </CardFooter>
            </Card>
          ))}
        </div>
      ) : null}

      {pendingStockItem ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 px-4">
          <Card className="w-full max-w-md border-border/70 bg-card/95 shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
            <CardHeader>
              <CardDescription>Confirmación</CardDescription>
              <CardTitle className="text-2xl">¿Actualizar stock?</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-2xl border border-border/70 bg-background/80 p-4 text-sm text-muted-foreground">
                Vas a cambiar <span className="font-semibold text-foreground">{pendingStockItem.product_name}</span> ({pendingStockItem.product_code}) de <span className="font-semibold text-foreground">{pendingStockItem.available_quantity}</span> a <span className="font-semibold text-foreground">{Number.parseInt(stockQuantity, 10) || 0}</span> unidades.
              </div>
            </CardContent>
            <CardFooter className="justify-end gap-2">
              <Button type="button" variant="outline" className="rounded-full" onClick={() => setPendingStockItem(null)}>
                Cancelar
              </Button>
              <Button type="button" className="rounded-full" disabled={isSavingStock} onClick={() => void updateStock()}>
                {isSavingStock ? "Guardando..." : "Confirmar"}
              </Button>
            </CardFooter>
          </Card>
        </div>
      ) : null}
    </main>
  );
}