// Pulls in @testing-library/jest-dom's ambient augmentation of Jest's
// `expect(...).toHaveValue(...)` etc. matchers for the TS type-checker.
// (Runtime registration happens separately, via the side-effect import in
// jest.setup.js.)
import "@testing-library/jest-dom";
