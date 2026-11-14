import { useId, type RefObject } from 'react';

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

  return (
    <div className="mb-4">
      <p className="mb-2 text-sm font-medium">Add photos</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <label
          htmlFor={cameraId}
          className={`inline-flex cursor-pointer items-center justify-center border border-black px-4 py-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${
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
          className={`inline-flex cursor-pointer items-center justify-center border border-black px-4 py-3 text-sm font-medium focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-black ${
            disabled ? 'cursor-not-allowed opacity-50' : ''
          }`}
        >
          Add from library
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
      </div>
      {disabled && disabledReason ? (
        <p className="mt-2 text-sm text-neutral-700">{disabledReason}</p>
      ) : null}
    </div>
  );
}