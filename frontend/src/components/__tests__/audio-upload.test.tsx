import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AudioUpload } from "../AudioUpload";

describe("AudioUpload component", () => {
  const mockOnFileSelected = vi.fn();
  const mockOnClear = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders file chooser and WAV input accessibly", () => {
    render(<AudioUpload file={null} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const label = screen.getByLabelText(/audio file/i);
    expect(label).toBeInTheDocument();

    const input = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]');
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("accept", ".wav,audio/wav,audio/x-wav,audio/wave");

    const chooseButton = screen.getByRole("button", { name: /choose wav file/i });
    expect(chooseButton).toBeInTheDocument();

    const dropzoneText = screen.getByText(/or drag and drop a wav file here/i);
    expect(dropzoneText).toBeInTheDocument();
  });

  it("calls onFileSelected when a file is selected via input", async () => {
    const user = userEvent.setup();
    render(<AudioUpload file={null} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const file = new File(["test audio content"], "test.wav", { type: "audio/wav" });
    const input = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    expect(mockOnFileSelected).toHaveBeenCalledTimes(1);
    expect(mockOnFileSelected).toHaveBeenCalledWith(file);
  });

  it("calls onFileSelected when a file is selected via choose button", async () => {
    const user = userEvent.setup();
    render(<AudioUpload file={null} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const file = new File(["test audio content"], "test.wav", { type: "audio/wav" });
    const input = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    await user.upload(input, file);

    expect(mockOnFileSelected).toHaveBeenCalledWith(file);
  });

  it("calls onClear when remove button is clicked", async () => {
    const user = userEvent.setup();
    const file = new File(["test audio content"], "test.wav", { type: "audio/wav" });
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const removeButton = screen.getByRole("button", { name: /remove/i });
    await user.click(removeButton);

    expect(mockOnClear).toHaveBeenCalledTimes(1);
  });

  it("displays selected filename and formatted size", () => {
    const file = new File(["x".repeat(1536)], "recording.wav", { type: "audio/wav" });
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    expect(screen.getByText("recording.wav")).toBeInTheDocument();
    expect(screen.getByText("1.5 KB")).toBeInTheDocument();
  });

  it("displays error accessibly with role=alert", () => {
    render(<AudioUpload file={null} error="File too large" onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const error = screen.getByText(/file too large/i);
    expect(error).toBeInTheDocument();
    expect(error).toHaveAttribute("role", "alert");
  });

  it("shows preliminary WAV warning for file that doesn't look like WAV", () => {
    const file = new File(["content"], "audio.mp3", { type: "audio/mpeg" });
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const warning = screen.getByText(/does not look like a wav file/i);
    expect(warning).toBeInTheDocument();
    expect(warning).toHaveAttribute("role", "status");
    expect(warning).toHaveTextContent(/The selected file does not look like a WAV file by extension or MIME type/);
  });

  it("does not show WAV warning for valid WAV file", () => {
    const file = new File(["content"], "audio.wav", { type: "audio/wav" });
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    expect(screen.queryByRole("status", { name: /does not look like a wav file/i })).not.toBeInTheDocument();
  });

  it("does not show WAV warning for file with wav extension", () => {
    const file = new File(["content"], "audio.wav", { type: "application/octet-stream" });
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    expect(screen.queryByRole("status", { name: /does not look like a wav file/i })).not.toBeInTheDocument();
  });

  it("disables interactions when disabled prop is true", async () => {
    const user = userEvent.setup();
    const file = new File(["test audio content"], "test.wav", { type: "audio/wav" });
    render(<AudioUpload file={null} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} disabled={true} />);

    const chooseButton = screen.getByRole("button", { name: /choose wav file/i });
    const input = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    expect(chooseButton).toBeDisabled();
    expect(input).toBeDisabled();

    // Try to upload - should not trigger callback
    await user.upload(input, file);
    expect(mockOnFileSelected).not.toHaveBeenCalled();
  });

  it("disables remove button when disabled prop is true", async () => {
    const user = userEvent.setup();
    const file = new File(["test audio content"], "test.wav", { type: "audio/wav" });
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} disabled={true} />);

    const removeButton = screen.getByRole("button", { name: /remove/i });
    expect(removeButton).toBeDisabled();

    await user.click(removeButton);
    expect(mockOnClear).not.toHaveBeenCalled();
  });

  it("does not trigger selection callback when no file is selected", async () => {
    render(<AudioUpload file={null} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const input = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;

    // Clear the input (simulate user cancelling file selection)
    fireEvent.change(input, { target: { files: [] } });

    expect(mockOnFileSelected).not.toHaveBeenCalled();
  });

  it("allows selecting the same file again after removal", async () => {
    const user = userEvent.setup();
    const file = new File(["test audio content"], "test.wav", { type: "audio/wav" });

    // Initial render with file selected
    render(<AudioUpload file={file} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    // Remove the file
    const removeButton = screen.getByRole("button", { name: /remove/i });
    await user.click(removeButton);
    expect(mockOnClear).toHaveBeenCalledTimes(1);

    // Now select the same file again
    const input = screen.getByLabelText(/audio file/i).parentElement?.querySelector('input[type="file"]') as HTMLInputElement;
    await user.upload(input, file);

    expect(mockOnFileSelected).toHaveBeenCalledTimes(1);
    expect(mockOnFileSelected).toHaveBeenLastCalledWith(file);
  });

  it("handles drag and drop", async () => {
    const file = new File(["test audio content"], "dropped.wav", { type: "audio/wav" });
    render(<AudioUpload file={null} error={null} onFileSelected={mockOnFileSelected} onClear={mockOnClear} />);

    const dropzone = screen.getByText(/or drag and drop a wav file here/i).parentElement;
    if (!dropzone) throw new Error("Dropzone not found");

    // Simulate drag over
    fireEvent.dragOver(dropzone);
    expect(dropzone).toHaveClass("dropzone-dragging");

    // Simulate drop
    const dataTransfer = {
      files: [file],
      types: ["Files"],
    };
    fireEvent.drop(dropzone, { dataTransfer });

    expect(mockOnFileSelected).toHaveBeenCalledWith(file);
  });
});