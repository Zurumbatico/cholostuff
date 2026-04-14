"use client";

import { type ChangeEvent, useDeferredValue, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { Minus, Plus, ShoppingCart, Trash2, X } from "lucide-react";
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
import { computeCartTotals, type CartItemPayload } from "@/lib/cart";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { formatPenPrice } from "@/lib/venom-pricing";

export type PricedVenomProduct = {
  code: string;
  name: string;
  summary: string;
  imageUrl: string | null;
  category: string;
  rarity: string;
  price: number;
};

type VenomCatalogProps = {
  products: PricedVenomProduct[];
};

type CartItem = CartItemPayload;

type CartSessionRow = {
  currency: string;
  id: string;
  total_amount: number;
  total_items: number;
  updated_at: string;
};

type CartItemRow = {
  category: string;
  image_url: string | null;
  name: string;
  product_code: string;
  quantity: number;
  rarity: string;
  summary: string;
  unit_price: number;
};

type InventoryRow = {
  available_quantity: number;
  product_code: string;
};

const PAGE_SIZE = 12;
const CART_ID_STORAGE_KEY = "cholostuff-cart-id";
const CART_ITEMS_STORAGE_KEY = "cholostuff-cart-items";
const WHATSAPP_PHONE = "51960203319";
const RARITY_ORDER = [
  "Common",
  "Uncommon",
  "Rare",
  "Rare Prime",
  "Super Rare",
  "Super Rare Prime",
  "Chase",
  "Chase Unique",
  "Legacy",
  "Game Element",
  "Special",
];

function buildPageWindow(currentPage: number, totalPages: number) {
  const start = Math.max(1, currentPage - 2);
  const end = Math.min(totalPages, start + 4);
  const normalizedStart = Math.max(1, end - 4);

  return Array.from({ length: end - normalizedStart + 1 }, (_, index) => normalizedStart + index);
}

function isCartItemPayload(value: unknown): value is CartItem {
  if (!value || typeof value !== "object") {
    return false;
  }

  const item = value as Record<string, unknown>;

  return (
    typeof item.code === "string" &&
    typeof item.name === "string" &&
    typeof item.summary === "string" &&
    (typeof item.imageUrl === "string" || item.imageUrl === null) &&
    typeof item.category === "string" &&
    typeof item.rarity === "string" &&
    typeof item.price === "number" &&
    typeof item.quantity === "number"
  );
}

function buildWhatsAppUrl(customerName: string, items: CartItem[]) {
  const lines = [
    "Hola, quiero comprar estas figuras de HeroClix Venom:",
    "",
    `Nombre: ${customerName}`,
    "",
    ...items.map(
      (item, index) =>
        `${index + 1}. ${item.name} (${item.code}) | Rareza: ${item.rarity} | Cantidad: ${item.quantity} | Unitario: ${formatPenPrice(item.price)} | Subtotal: ${formatPenPrice(item.price * item.quantity)}`,
    ),
    "",
    `Total de piezas: ${items.reduce((total, item) => total + item.quantity, 0)}`,
    `Total pedido: ${formatPenPrice(items.reduce((total, item) => total + item.price * item.quantity, 0))}`,
  ];

  return `https://api.whatsapp.com/send?phone=${WHATSAPP_PHONE}&text=${encodeURIComponent(lines.join("\n"))}`;
}

function mapCartItemRow(row: CartItemRow): CartItem {
  return {
    category: row.category,
    code: row.product_code,
    imageUrl: row.image_url,
    name: row.name,
    price: row.unit_price,
    quantity: row.quantity,
    rarity: row.rarity,
    summary: row.summary,
  };
}

export function VenomCatalog({ products }: VenomCatalogProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState("Todos");
  const [selectedRarity, setSelectedRarity] = useState("Todas");
  const [sortOrder, setSortOrder] = useState<"price-desc" | "price-asc">("price-desc");
  const [currentPage, setCurrentPage] = useState(1);
  const [cartItems, setCartItems] = useState<CartItem[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartPersistence, setCartPersistence] = useState<"loading" | "remote" | "local" | "error">("loading");
  const [isCartSaving, setIsCartSaving] = useState(false);
  const [isSubmittingOrder, setIsSubmittingOrder] = useState(false);
  const [submitMessage, setSubmitMessage] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [inventoryByCode, setInventoryByCode] = useState<Record<string, number>>({});
  const [inventoryStatus, setInventoryStatus] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const hasBootstrappedCart = useRef(false);
  const deferredSearch = useDeferredValue(searchTerm);

  const categories = [
    "Todos",
    ...Array.from(new Set(products.map((product) => product.category))).sort((left, right) =>
      left.localeCompare(right),
    ),
  ];
  const rarities = [
    "Todas",
    ...Array.from(new Set(products.map((product) => product.rarity))).sort((left, right) => {
      const leftIndex = RARITY_ORDER.indexOf(left);
      const rightIndex = RARITY_ORDER.indexOf(right);

      if (leftIndex === -1 && rightIndex === -1) {
        return left.localeCompare(right);
      }

      if (leftIndex === -1) {
        return 1;
      }

      if (rightIndex === -1) {
        return -1;
      }

      return leftIndex - rightIndex;
    }),
  ];

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredProducts = products.filter((product) => {
    const matchesCategory = selectedCategory === "Todos" || product.category === selectedCategory;
    const matchesRarity = selectedRarity === "Todas" || product.rarity === selectedRarity;
    const searchableText = `${product.name} ${product.code} ${product.summary}`.toLowerCase();
    const matchesSearch = !normalizedSearch || searchableText.includes(normalizedSearch);

    return matchesCategory && matchesRarity && matchesSearch;
  });

  const orderedProducts = [...filteredProducts].sort((left, right) => {
    if (sortOrder === "price-asc") {
      return left.price - right.price;
    }

    return right.price - left.price;
  });

  const totalPages = Math.max(1, Math.ceil(orderedProducts.length / PAGE_SIZE));
  const effectivePage = Math.min(currentPage, totalPages);
  const startIndex = (effectivePage - 1) * PAGE_SIZE;
  const paginatedProducts = orderedProducts.slice(startIndex, startIndex + PAGE_SIZE);
  const pageWindow = buildPageWindow(effectivePage, totalPages);
  const cartTotals = computeCartTotals(cartItems);
  const totalCartItems = cartTotals.totalItems;
  const cartTotal = cartTotals.totalAmount;
  const trimmedCustomerName = customerName.trim();
  const whatsappUrl = buildWhatsAppUrl(trimmedCustomerName || "Cliente", cartItems);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCategory, selectedRarity, sortOrder, normalizedSearch]);

  useEffect(() => {
    let isCancelled = false;

    async function loadInventory() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        return;
      }

      setInventoryStatus("loading");

      const { data, error } = await supabase
        .from("product_inventory")
        .select("product_code, available_quantity")
        .eq("is_active", true);

      if (isCancelled) {
        return;
      }

      if (error) {
        setInventoryStatus("error");
        return;
      }

      const nextInventoryByCode = Object.fromEntries(
        ((data ?? []) as InventoryRow[]).map((item) => [item.product_code, item.available_quantity]),
      );

      setInventoryByCode(nextInventoryByCode);
      setInventoryStatus("ready");
    }

    void loadInventory();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    let isCancelled = false;
    const storedItems = window.localStorage.getItem(CART_ITEMS_STORAGE_KEY);
    let fallbackItems: unknown[] = [];

    if (storedItems) {
      try {
        const parsedItems = JSON.parse(storedItems);
        fallbackItems = Array.isArray(parsedItems) ? parsedItems : [];
      } catch {
        window.localStorage.removeItem(CART_ITEMS_STORAGE_KEY);
      }
    }

    if (Array.isArray(fallbackItems)) {
      const validItems = fallbackItems.filter(isCartItemPayload);
      if (validItems.length > 0) {
        setCartItems(validItems);
      }
    }

    async function createRemoteCart() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setCartPersistence("local");
        return;
      }

      const { data, error } = await supabase
        .from("cart_sessions")
        .insert({ currency: "PEN", total_amount: 0, total_items: 0 })
        .select("id, currency, total_amount, total_items, updated_at")
        .single<CartSessionRow>();

      if (isCancelled) {
        return;
      }

      if (error || !data) {
        setCartPersistence("local");
        return;
      }

      setCartId(data.id);
      setCartPersistence("remote");
      window.localStorage.setItem(CART_ID_STORAGE_KEY, data.id);
    }

    async function bootstrapCart() {
      const storedCartId = window.localStorage.getItem(CART_ID_STORAGE_KEY);
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setCartPersistence("local");
        hasBootstrappedCart.current = true;
        return;
      }

      if (!storedCartId) {
        await createRemoteCart();
        if (!isCancelled) {
          hasBootstrappedCart.current = true;
        }
        return;
      }

      const { data: cartData, error: cartError } = await supabase
        .from("cart_sessions")
        .select("id, currency, total_amount, total_items, updated_at")
        .eq("id", storedCartId)
        .single<CartSessionRow>();

      if (cartError || !cartData) {
        window.localStorage.removeItem(CART_ID_STORAGE_KEY);
        await createRemoteCart();
        if (!isCancelled) {
          hasBootstrappedCart.current = true;
        }
        return;
      }

      const { data: itemData, error: itemError } = await supabase
        .from("cart_items")
        .select("product_code, name, summary, image_url, category, rarity, unit_price, quantity")
        .eq("cart_id", storedCartId)
        .order("created_at", { ascending: true });

      if (isCancelled) {
        return;
      }

      if (itemError) {
        setCartPersistence("local");
        hasBootstrappedCart.current = true;
        return;
      }

      setCartId(cartData.id);
      setCartItems(Array.isArray(itemData) ? itemData.map((item) => mapCartItemRow(item as CartItemRow)) : []);
      setCartPersistence("remote");
      window.localStorage.setItem(CART_ID_STORAGE_KEY, cartData.id);
      hasBootstrappedCart.current = true;
    }

    void bootstrapCart();

    return () => {
      isCancelled = true;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(CART_ITEMS_STORAGE_KEY, JSON.stringify(cartItems));
  }, [cartItems]);

  useEffect(() => {
    if (!hasBootstrappedCart.current || !cartId || cartPersistence !== "remote") {
      return;
    }

    let isCancelled = false;

    async function persistCart() {
      const supabase = getSupabaseBrowserClient();

      if (!supabase) {
        setCartPersistence("local");
        return;
      }

      setIsCartSaving(true);

      try {
        const { error: updateCartError } = await supabase
          .from("cart_sessions")
          .update({
            total_amount: cartTotal,
            total_items: totalCartItems,
            updated_at: new Date().toISOString(),
          })
          .eq("id", cartId);

        if (updateCartError) {
          throw new Error("No se pudo actualizar el carrito.");
        }

        const { error: deleteItemsError } = await supabase.from("cart_items").delete().eq("cart_id", cartId);

        if (deleteItemsError) {
          throw new Error("No se pudo limpiar el detalle del carrito.");
        }

        if (cartItems.length > 0) {
          const { error: insertItemsError } = await supabase.from("cart_items").insert(
            cartItems.map((item) => ({
              cart_id: cartId,
              category: item.category,
              image_url: item.imageUrl,
              name: item.name,
              product_code: item.code,
              quantity: item.quantity,
              rarity: item.rarity,
              summary: item.summary,
              unit_price: item.price,
            })),
          );

          if (insertItemsError) {
            throw new Error("No se pudo guardar el detalle del carrito.");
          }
        }

        if (!isCancelled) {
          setCartPersistence("remote");
        }
      } catch {
        if (!isCancelled) {
          setCartPersistence("error");
        }
      } finally {
        if (!isCancelled) {
          setIsCartSaving(false);
        }
      }
    }

    void persistCart();

    return () => {
      isCancelled = true;
    };
  }, [cartId, cartItems, cartPersistence, cartTotal, totalCartItems]);

  function addToCart(product: PricedVenomProduct) {
    const availableQuantity = inventoryByCode[product.code];
    const currentQuantity = cartItems.find((item) => item.code === product.code)?.quantity ?? 0;

    if (typeof availableQuantity === "number" && currentQuantity >= availableQuantity) {
      return;
    }

    setCartItems((currentItems) => {
      const existingItem = currentItems.find((item) => item.code === product.code);

      if (existingItem) {
        return currentItems.map((item) =>
          item.code === product.code ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [...currentItems, { ...product, quantity: 1 }];
    });
    setIsCartOpen(true);
  }

  function updateQuantity(code: string, delta: number) {
    setCartItems((currentItems) =>
      currentItems
        .map((item) => (item.code === code ? { ...item, quantity: item.quantity + delta } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  function removeFromCart(code: string) {
    setCartItems((currentItems) => currentItems.filter((item) => item.code !== code));
  }

  async function handleCheckout() {
    if (cartItems.length === 0) {
      return;
    }

    if (!trimmedCustomerName) {
      setSubmitMessage("Escribe tu nombre antes de agendar el pedido.");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    if (!supabase || !cartId) {
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
      return;
    }

    setIsSubmittingOrder(true);
    setSubmitMessage(null);

    try {
      const { data: orderId, error: submitError } = await supabase.rpc("submit_cart_for_approval", {
        p_cart_id: cartId,
        p_customer_name: trimmedCustomerName,
        p_customer_phone: WHATSAPP_PHONE,
      });

      if (submitError || !orderId) {
        throw new Error(submitError?.message ?? "No se pudo crear el ticket.");
      }

      const { data: nextCart, error: nextCartError } = await supabase
        .from("cart_sessions")
        .insert({ currency: "PEN", total_amount: 0, total_items: 0 })
        .select("id, currency, total_amount, total_items, updated_at")
        .single<CartSessionRow>();

      if (nextCartError || !nextCart) {
        throw new Error(nextCartError?.message ?? "No se pudo reiniciar el carrito.");
      }

      setCartId(nextCart.id);
      setCartItems([]);
      setCustomerName("");
      setIsCartOpen(false);
      setSubmitMessage(null);
      window.localStorage.setItem(CART_ID_STORAGE_KEY, nextCart.id);
      window.localStorage.setItem(CART_ITEMS_STORAGE_KEY, JSON.stringify([]));
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
      const message = error instanceof Error ? error.message : "No se pudo crear el ticket.";
      setSubmitMessage(`${message} El carrito sigue disponible para reintentar.`);
    } finally {
      setIsSubmittingOrder(false);
    }
  }

  return (
    <>
      <section id="catalogo-venom" className="space-y-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              Expansión Venom
            </p>
            <h2 className="display-title text-4xl leading-none sm:text-5xl">Catálogo completo del set Venom</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" size="lg" className="rounded-full px-5" onClick={() => setIsCartOpen(true)}>
              <ShoppingCart />
              {totalCartItems > 0 ? `Carrito (${totalCartItems})` : "Carrito"}
            </Button>
            {categories.slice(1).map((category) => {
              const total = products.filter((product) => product.category === category).length;

              return (
                <Badge key={category} variant="outline" className="rounded-full bg-background/80 px-3 py-1 text-sm">
                  {category}: {total}
                </Badge>
              );
            })}
          </div>
        </div>

        <Card className="border-border/70 bg-card/88 shadow-none">
          <CardHeader className="flex flex-col gap-4">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <CardDescription>Filtra y encuentra</CardDescription>
                <CardTitle className="text-2xl">Busca por nombre, rareza o categoría</CardTitle>
              </div>
              <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                <span>Mostrando: {orderedProducts.length}</span>
                <span>Página: {effectivePage}/{totalPages}</span>
                <span>Precios en soles</span>
              </div>
            </div>

            <div className="w-full space-y-4 rounded-[1.5rem] border border-border/70 bg-background/70 p-4 sm:p-5">
              <div className="grid gap-3 xl:grid-cols-[minmax(0,1fr)_260px] xl:items-center">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-foreground">Buscar producto</p>
                    <p className="text-xs text-muted-foreground">Nombre, código o personaje</p>
                  </div>
                  <Input
                    value={searchTerm}
                    onChange={(event: ChangeEvent<HTMLInputElement>) => setSearchTerm(event.target.value)}
                    className="h-11 rounded-2xl bg-card px-4"
                    placeholder="Ej. venom, knull, ve054"
                  />
                </div>

                <div className="space-y-2">
                  <p className="text-sm font-medium text-foreground">Orden</p>
                  <div className="inline-flex w-full rounded-2xl border border-border bg-card p-1">
                    <Button
                      type="button"
                      variant={sortOrder === "price-desc" ? "default" : "ghost"}
                      className="h-9 flex-1 rounded-xl"
                      onClick={() => setSortOrder("price-desc")}
                    >
                      Precio alto
                    </Button>
                    <Button
                      type="button"
                      variant={sortOrder === "price-asc" ? "default" : "ghost"}
                      className="h-9 flex-1 rounded-xl"
                      onClick={() => setSortOrder("price-asc")}
                    >
                      Precio bajo
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-3 border-t border-border/70 pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Categorías de producto</p>
                    <p className="text-xs text-muted-foreground">Filtra entre figuras, objetos, one-shots y más.</p>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      Activo: <span className="font-semibold text-foreground">{selectedCategory}</span>
                    </span>
                    {(selectedCategory !== "Todos" || selectedRarity !== "Todas" || searchTerm) && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="h-8 rounded-full px-3"
                        onClick={() => {
                          setSelectedCategory("Todos");
                          setSelectedRarity("Todas");
                          setSearchTerm("");
                        }}
                      >
                        Limpiar
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {categories.map((category) => {
                    const isActive = selectedCategory === category;

                    return (
                      <Button
                        key={category}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => setSelectedCategory(category)}
                      >
                        {category}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3 border-t border-border/70 pt-4">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-sm font-medium text-foreground">Rareza de ficha</p>
                    <p className="text-xs text-muted-foreground">Ubica desde piezas de entrada hasta chase de alto valor.</p>
                  </div>
                  <div className="text-xs text-muted-foreground">
                    Activa: <span className="font-semibold text-foreground">{selectedRarity}</span>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {rarities.map((rarity) => {
                    const isActive = selectedRarity === rarity;

                    return (
                      <Button
                        key={rarity}
                        type="button"
                        variant={isActive ? "default" : "outline"}
                        className="rounded-full"
                        onClick={() => setSelectedRarity(rarity)}
                      >
                        {rarity}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardHeader>

          <CardContent className="space-y-6">
            {paginatedProducts.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-border bg-background/70 px-6 py-12 text-center">
                <p className="text-lg font-semibold text-foreground">No se encontraron figuras con esos filtros.</p>
                <p className="mt-2 text-sm text-muted-foreground">
                  Prueba con otra combinación o limpia los filtros para ver todo el set.
                </p>
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                {paginatedProducts.map((product) => (
                  <Card key={product.code} className="flex h-full flex-col overflow-hidden border-border/70 bg-background/70 shadow-none">
                    <CardHeader className="gap-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-2">
                          <div className="flex flex-wrap gap-2">
                            <Badge variant="secondary" className="w-fit bg-accent text-accent-foreground">
                              {product.category}
                            </Badge>
                            <Badge variant="outline" className="w-fit rounded-full bg-background/80">
                              {product.rarity}
                            </Badge>
                            <Badge variant="outline" className="w-fit rounded-full bg-background/80">
                              {inventoryStatus === "loading"
                                ? "Stock cargando..."
                                : `Stock: ${inventoryByCode[product.code] ?? 0}`}
                            </Badge>
                          </div>
                          <CardTitle className="min-h-[3.5rem] text-xl leading-6">{product.name}</CardTitle>
                        </div>
                        <Badge variant="outline" className="rounded-full bg-background/80 font-mono text-xs">
                          {product.code}
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col space-y-4">
                      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                        {product.imageUrl ? (
                          <Image
                            src={product.imageUrl}
                            alt={product.name}
                            fill
                            className="object-contain p-4"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <p className="min-h-[4.5rem] text-sm leading-6 text-muted-foreground">{product.summary}</p>
                    </CardContent>
                    <CardFooter className="justify-between gap-3">
                      <div>
                        <span className="text-sm text-muted-foreground">Precio</span>
                        <p className="text-lg font-bold text-primary">{formatPenPrice(product.price)}</p>
                      </div>
                      <Button
                        type="button"
                        className="rounded-full"
                        disabled={inventoryStatus === "ready" && (inventoryByCode[product.code] ?? 0) <= 0}
                        onClick={() => addToCart(product)}
                      >
                        <Plus />
                        {inventoryStatus === "ready" && (inventoryByCode[product.code] ?? 0) <= 0 ? "Sin stock" : "Agregar"}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}

            <div className="flex flex-col gap-3 border-t border-border/70 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-muted-foreground">
                {orderedProducts.length === 0
                  ? "Sin productos para mostrar."
                  : `Mostrando ${startIndex + 1}-${Math.min(startIndex + PAGE_SIZE, orderedProducts.length)} de ${orderedProducts.length} productos.`}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                  disabled={effectivePage === 1}
                >
                  Anterior
                </Button>
                {pageWindow.map((pageNumber) => (
                  <Button
                    key={pageNumber}
                    type="button"
                    variant={pageNumber === effectivePage ? "default" : "outline"}
                    className="rounded-full"
                    onClick={() => setCurrentPage(pageNumber)}
                  >
                    {pageNumber}
                  </Button>
                ))}
                <Button
                  type="button"
                  variant="outline"
                  className="rounded-full"
                  onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                  disabled={effectivePage === totalPages}
                >
                  Siguiente
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <div
        className={`fixed inset-0 z-40 bg-black/45 transition-opacity duration-200 ${isCartOpen ? "pointer-events-auto opacity-100" : "pointer-events-none opacity-0"}`}
        onClick={() => setIsCartOpen(false)}
        aria-hidden="true"
      />

      <aside
        className={`fixed right-0 top-0 z-50 flex h-screen w-full max-w-md flex-col border-l border-border bg-background shadow-[0_20px_80px_rgba(0,0,0,0.28)] transition-transform duration-300 ${isCartOpen ? "translate-x-0" : "translate-x-full"}`}
        aria-label="Carrito de compra"
      >
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.24em] text-muted-foreground">Tu carrito</p>
            <h3 className="display-title text-3xl leading-none">Pedido Venom</h3>
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => setIsCartOpen(false)}>
            <X />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {cartItems.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-border bg-card/70 px-6 py-10 text-center">
              <ShoppingCart className="mx-auto mb-3" />
              <p className="text-lg font-semibold text-foreground">Tu carrito está vacío.</p>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">
                Agrega figuras del catálogo y arma tu pedido para enviarlo por WhatsApp.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {cartItems.map((item) => (
                <Card key={item.code} className="gap-3 border-border/70 bg-card/88 py-0 shadow-none">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-border/60 bg-muted/40">
                        {item.imageUrl ? (
                          <Image
                            src={item.imageUrl}
                            alt={item.name}
                            fill
                            className="object-contain p-2"
                            unoptimized
                          />
                        ) : null}
                      </div>
                      <div className="min-w-0 flex-1 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="text-sm font-semibold text-foreground">{item.name}</p>
                            <p className="text-xs text-muted-foreground">{item.code} · {item.rarity}</p>
                          </div>
                          <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => removeFromCart(item.code)}>
                            <Trash2 />
                          </Button>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <div className="inline-flex items-center rounded-full border border-border bg-background p-1">
                            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => updateQuantity(item.code, -1)}>
                              <Minus />
                            </Button>
                            <span className="min-w-10 text-center text-sm font-semibold">{item.quantity}</span>
                            <Button type="button" variant="ghost" size="icon" className="size-8" onClick={() => updateQuantity(item.code, 1)}>
                              <Plus />
                            </Button>
                          </div>
                          <div className="text-right">
                            <p className="text-xs text-muted-foreground">Subtotal</p>
                            <p className="text-base font-bold text-primary">{formatPenPrice(item.quantity * item.price)}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        <div className="border-t border-border bg-card/70 px-5 py-4">
          <div className="mb-4 space-y-2">
            <div className="rounded-2xl border border-primary/25 bg-primary/10 px-4 py-3">
              <p className="text-sm font-semibold uppercase tracking-[0.18em] text-primary">Importante</p>
              <p className="mt-1 text-sm leading-6 text-foreground">
                Necesitas escribir tu nombre para poder crear el pedido y continuar por WhatsApp.
              </p>
            </div>
            <div className="space-y-2 pb-2">
              <p className="text-sm font-medium text-foreground">Tu nombre para agendar</p>
              <Input
                value={customerName}
                onChange={(event: ChangeEvent<HTMLInputElement>) => setCustomerName(event.target.value)}
                className="h-11 rounded-2xl bg-background px-4"
                placeholder="Escribe tu nombre"
              />
            </div>
            <div className="flex items-center justify-between text-sm text-muted-foreground">
              <span>Piezas</span>
              <span>{totalCartItems}</span>
            </div>
            <div className="flex items-center justify-between text-lg font-semibold text-foreground">
              <span>Total</span>
              <span>{formatPenPrice(cartTotal)}</span>
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Estado</span>
              <span>
                {cartPersistence === "loading" && "Conectando carrito..."}
                {cartPersistence === "remote" && (isCartSaving ? "Guardando en Supabase..." : "Sincronizado con Supabase")}
                {cartPersistence === "local" && "Modo local"}
                {cartPersistence === "error" && "Error de sincronización"}
              </span>
            </div>
          </div>

          {submitMessage ? (
            <div className="mb-3 rounded-2xl border border-border/70 bg-background/80 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {submitMessage}
            </div>
          ) : null}

          <Button
            type="button"
            size="lg"
            className="w-full rounded-full"
            disabled={cartItems.length === 0 || isSubmittingOrder || !trimmedCustomerName}
            onClick={() => void handleCheckout()}
          >
            {isSubmittingOrder ? "Creando ticket..." : "Comprar por WhatsApp"}
          </Button>
          <p className="mt-2 text-xs leading-5 text-muted-foreground">
            Al comprar se abre WhatsApp con el detalle de tu pedido para continuar la atención.
          </p>
        </div>
      </aside>

      <Button
        type="button"
        size="lg"
        className="fixed bottom-5 right-5 z-30 rounded-full px-5 shadow-[0_16px_45px_rgba(0,0,0,0.18)]"
        onClick={() => setIsCartOpen(true)}
      >
        <ShoppingCart />
        {totalCartItems > 0 ? `Carrito (${totalCartItems})` : "Carrito"}
      </Button>
    </>
  );
}
