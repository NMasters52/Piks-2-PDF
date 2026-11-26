import { useEffect, useId, useState, type RefObject } from 'react';

type CaptureControlsProps = {
  cameraInputRef: RefObject<HTMLInputElement | null>;
  libraryInputRef: RefObject<HTMLInputElement | null>;
  onCameraChange: (files: FileList | null) => void;
  onLibraryChange: (files: FileList | null) => void;
  disabled: boolean;
  disabledReason?: string;
};

export function CaptureControls({
  cameraInputRef,
  libraryInputRef,
  onCameraChange,
  onLibraryChange,
  disabled,
  disabledReason,
}: CaptureControlsProps) {
  const cameraId = useId();
  const libraryId = useId();

  const [atTop, setAtTop] = useState(true);
  useEffect(() => {
    const update = () => setAtTop(window.scrollY <= 0);
    update();
    window.addEventListener('scroll', update, { passive: true });
    return () => window.removeEventListener('scroll', update);
  }, []);
  return (
    <div className="capture-bar fixed inset-x-0 bottom-0 z-10 mx-auto max-w-2xl border-t border-neutral-200 bg-white px-4 pt-2 sm:px-6 pb-[max(.5rem,env(safe-area-inset-bottom))]">
      <div className="grid grid-cols-3 gap-2">
        <label
          htmlFor={cameraId}
          className={`inline-flex cursor-pointer items-center justify-center border border-black px-1 py-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          Take photo
          <input
            ref={cameraInputRef}
            id={cameraId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              onCameraChange(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <label
          htmlFor={libraryId}
          className={`inline-flex cursor-pointer items-center justify-center border border-black px-1 py-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          Add photos
          <input
            ref={libraryInputRef}
            id={libraryId}
            type="file"
            accept="image/jpeg,image/png,image/heic"
            multiple
            disabled={disabled}
            className="sr-only"
            onChange={(e) => {
              onLibraryChange(e.target.files);
              e.target.value = '';
            }}
          />
        </label>
        <button type="button" disabled={atTop} onClick={() => window.scrollTo(0, 0)} className="border px-1 text-sm disabled:opacity-50">Back to top ↑</button>
      </div>
      {disabled && disabledReason ? (
        <p className="mt-2 text-sm text-neutral-700">{disabledReason}</p>
      ) : null}
    </div>
  );
}