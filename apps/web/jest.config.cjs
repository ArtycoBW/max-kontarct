module.exports = {
  roots: ["<rootDir>/lib"],
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      { tsconfig: "<rootDir>/tsconfig.test.json" },
    ],
  },
};
