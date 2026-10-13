import { Lumo } from './Lumo';

/** Shown for a moment while a page's code loads. */
export function PageLoading() {
  return (
    <div className="grid min-h-[50dvh] place-items-center" aria-busy="true">
      <Lumo size={72} mood="sleepy" />
    </div>
  );
}
