import type { PhysicalTest, SkillValue } from "../../shared/athlete";

type SeedPlayer = {
  name: string;
  age: number;
  nationality: string;
  position: (typeof import("../../shared/athlete").POSITIONS)[number];
  foot: string;
  height: number;
  weight: number;
  region: string;
  birthDate: string;
  jersey: number;
  photoKey: string;
  overall: number;
  improvement: number;
  discoverable: boolean;
  strengths: string[];
  weaknesses: string[];
  skills: SkillValue[];
  physicalTests: PhysicalTest[];
  history: { date: string; label: string; score: number; skill: string }[];
};

/**
 * The sole newly-created demo player. Its zero/empty legacy fields mean unknown,
 * not a score or a physical measurement. No portrait or third-party identity is
 * attached to this record.
 */
export function demoPlayersForSeed(_now = new Date()): SeedPlayer[] {
  return [
    {
      name: "ميسي",
      age: 0,
      nationality: "غير معروف",
      position: "مهاجم",
      foot: "غير معروف",
      height: 0,
      weight: 0,
      region: "غير معروف",
      birthDate: "",
      jersey: 0,
      photoKey: "",
      overall: 0,
      improvement: 0,
      discoverable: false,
      strengths: [],
      weaknesses: [],
      skills: [],
      physicalTests: [],
      history: [],
    },
  ];
}
