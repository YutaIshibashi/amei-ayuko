/**
 * Emits a JSON-LD block.
 *
 * For statically known pages the graph is rendered at build time. Product and
 * news pages are different: their data is not available during `next build`,
 * so `render.php` injects the crawler-facing graph into the served HTML (see
 * backend/public/render.php). This component covers the static pages only.
 */
export default function JsonLd({ data }: { data: Record<string, unknown> | Record<string, unknown>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is escaped for the `</script>` case below.
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data).replace(/</g, '\\u003c'),
      }}
    />
  );
}
