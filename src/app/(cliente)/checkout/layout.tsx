/** Durante a compra, o chat flutuante sai da tela (src/app/globals.css, [data-sem-chat]). */
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <span hidden data-sem-chat />
      {children}
    </>
  );
}
