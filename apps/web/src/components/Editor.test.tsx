import { render, screen, fireEvent } from "@testing-library/react";
import { Editor } from "./Editor";

/**
 * Monaco itself ships no useful jsdom behavior and isn't what this component
 * needs to prove — the Editor wrapper's own prop-forwarding and its
 * `onChange` coalescing are the real logic. Stub Monaco with a plain
 * <textarea> and capture the exact props Editor hands it.
 */
type CapturedProps = {
  language: string;
  value: string;
  onChange: (v: string | undefined) => void;
  options: { readOnly: boolean };
};
let captured: CapturedProps | null = null;

jest.mock("@monaco-editor/react", () => ({
  __esModule: true,
  default: (props: CapturedProps) => {
    captured = props;
    return (
      <textarea
        data-testid="monaco-stub"
        aria-label="code"
        readOnly={props.options?.readOnly}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    );
  },
}));

describe("Editor", () => {
  beforeEach(() => {
    captured = null;
  });

  it("renders the given value and defaults language to python, readOnly to false", () => {
    render(<Editor value="print(1)" />);

    expect(screen.getByTestId("monaco-stub")).toHaveValue("print(1)");
    expect(captured?.language).toBe("python");
    expect(captured?.options.readOnly).toBe(false);
  });

  it("forwards a non-default language and readOnly", () => {
    render(<Editor value="console.log(1)" language="javascript" readOnly />);

    expect(captured?.language).toBe("javascript");
    expect(captured?.options.readOnly).toBe(true);
  });

  it("calls the consumer's onChange with the edited value", () => {
    const onChange = jest.fn();
    render(<Editor value="a" onChange={onChange} />);

    fireEvent.change(screen.getByTestId("monaco-stub"), { target: { value: "ab" } });

    expect(onChange).toHaveBeenCalledWith("ab");
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("coalesces Monaco's `undefined` value to an empty string instead of forwarding it raw", () => {
    const onChange = jest.fn();
    render(<Editor value="a" onChange={onChange} />);

    // Monaco reports `undefined` when the model is fully cleared; Editor
    // must normalize that before it reaches consumers.
    captured?.onChange(undefined);

    expect(onChange).toHaveBeenCalledWith("");
  });

  it("does not throw when no onChange handler is supplied (read-only usage)", () => {
    render(<Editor value="a" readOnly />);

    expect(() => captured?.onChange("z")).not.toThrow();
  });
});
