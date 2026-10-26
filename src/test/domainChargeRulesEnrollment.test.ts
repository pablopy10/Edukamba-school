import { describe, expect, it } from "vitest";
import {
  isDomainEnrollmentActive,
  studentsMatchingDomainChargeRule,
  type ClassroomLite,
  type DomainChargeRuleRow,
  type StudentLite,
} from "@/lib/finance/chargeRulePeriods";

describe("Domain Charge Rules - Enrolled Students Only Requirement", () => {
  describe("isDomainEnrollmentActive", () => {
    it("considers null or empty as active default", () => {
      expect(isDomainEnrollmentActive(null)).toBe(true);
      expect(isDomainEnrollmentActive(undefined)).toBe(true);
      expect(isDomainEnrollmentActive("")).toBe(true);
    });

    it("accepts common active status variations in Portuguese and English", () => {
      expect(isDomainEnrollmentActive("ativa")).toBe(true);
      expect(isDomainEnrollmentActive("ativo")).toBe(true);
      expect(isDomainEnrollmentActive("ACTIVE")).toBe(true);
      expect(isDomainEnrollmentActive("active")).toBe(true);
      expect(isDomainEnrollmentActive("Ativa")).toBe(true);
      expect(isDomainEnrollmentActive(" Ativo ")).toBe(true);
    });

    it("rejects cancelled, inactive, or suspended statuses", () => {
      expect(isDomainEnrollmentActive("cancelada")).toBe(false);
      expect(isDomainEnrollmentActive("cancelado")).toBe(false);
      expect(isDomainEnrollmentActive("CANCELLED")).toBe(false);
      expect(isDomainEnrollmentActive("canceled")).toBe(false);
      expect(isDomainEnrollmentActive("inativa")).toBe(false);
      expect(isDomainEnrollmentActive("inativo")).toBe(false);
      expect(isDomainEnrollmentActive("INACTIVE")).toBe(false);
      expect(isDomainEnrollmentActive("suspensa")).toBe(false);
      expect(isDomainEnrollmentActive("suspenso")).toBe(false);
      expect(isDomainEnrollmentActive("suspended")).toBe(false);
    });
  });

  describe("studentsMatchingDomainChargeRule", () => {
    const yearId = "year-2026";
    const activityId = "act-judo-01";
    const routeId = "route-norte-01";
    const mealId = "meal-almoco-01";

    const classrooms: ClassroomLite[] = [
      { id: "room-1", name: "1.ª Classe A", academic_year_id: yearId },
      { id: "room-2", name: "2.ª Classe B", academic_year_id: yearId },
    ];

    const students: StudentLite[] = [
      { id: "st-1", full_name: "Ana Silva", classroom_id: "room-1" },
      { id: "st-2", full_name: "Bruno Costa", classroom_id: "room-1" },
      { id: "st-3", full_name: "Carlos Dias", classroom_id: "room-2" },
      { id: "st-4", full_name: "Daniela Faria", classroom_id: "room-2" },
    ];

    it("for all_enrolled: matches strictly students in enrolledStudentIds", () => {
      // Only Ana (st-1) and Carlos (st-3) are enrolled in Judo
      const enrolledIds = new Set(["st-1", "st-3"]);

      const rule: DomainChargeRuleRow = {
        id: "rule-all",
        activity_id: activityId,
        academic_year_id: yearId,
        target_scope: "all_enrolled",
        monthly_amount: 15000,
        due_day: 10,
        months_count: 10,
        start_month: 9,
        recurrence: "monthly",
      };

      const matched = studentsMatchingDomainChargeRule(
        rule,
        yearId,
        enrolledIds,
        students,
        classrooms,
        [rule],
      );

      expect(matched.map((s) => s.id)).toEqual(["st-1", "st-3"]);
      expect(matched.some((s) => s.id === "st-2")).toBe(false);
      expect(matched.some((s) => s.id === "st-4")).toBe(false);
    });

    it("for classrooms: matches only students in that classroom WHO ARE ENROLLED", () => {
      // Both room-1 students: Ana (st-1) and Bruno (st-2) are in room-1
      // BUT only Bruno (st-2) is enrolled in Transport route
      const enrolledTransportIds = new Set(["st-2", "st-4"]);

      const transportRule: DomainChargeRuleRow = {
        id: "rule-trans-room-1",
        route_id: routeId,
        academic_year_id: yearId,
        target_scope: "classrooms",
        monthly_amount: 25000,
        due_day: 5,
        months_count: 10,
        start_month: 9,
        recurrence: "monthly",
        transport_charge_rule_classrooms: [{ classroom_id: "room-1" }],
      };

      const matched = studentsMatchingDomainChargeRule(
        transportRule,
        yearId,
        enrolledTransportIds,
        students,
        classrooms,
        [transportRule],
      );

      // Even though Ana (st-1) is in room-1, she is NOT enrolled in transport, so she is NOT matched
      expect(matched.map((s) => s.id)).toEqual(["st-2"]);
    });

    it("for students: matches only students in the target list WHO ARE ENROLLED", () => {
      // Daniela (st-4) is enrolled in meals; Carlos (st-3) is NOT enrolled
      const enrolledMealIds = new Set(["st-4"]);

      const mealRule: DomainChargeRuleRow = {
        id: "rule-meal-st",
        meal_program_id: mealId,
        academic_year_id: yearId,
        target_scope: "students",
        monthly_amount: 30000,
        due_day: 10,
        months_count: 10,
        start_month: 9,
        recurrence: "monthly",
        meal_charge_rule_students: [{ student_id: "st-3" }, { student_id: "st-4" }],
      };

      const matched = studentsMatchingDomainChargeRule(
        mealRule,
        yearId,
        enrolledMealIds,
        students,
        classrooms,
        [mealRule],
      );

      // Carlos (st-3) was in meal_charge_rule_students, but is not enrolled, so ONLY Daniela (st-4) matches
      expect(matched.map((s) => s.id)).toEqual(["st-4"]);
    });

    it("returns empty list if enrolledStudentIds is empty", () => {
      const emptyEnrolled = new Set<string>();

      const rule: DomainChargeRuleRow = {
        id: "rule-empty",
        activity_id: activityId,
        academic_year_id: yearId,
        target_scope: "all_enrolled",
        monthly_amount: 10000,
        due_day: 10,
        months_count: 10,
        start_month: 9,
        recurrence: "monthly",
      };

      const matched = studentsMatchingDomainChargeRule(
        rule,
        yearId,
        emptyEnrolled,
        students,
        classrooms,
        [rule],
      );

      expect(matched).toEqual([]);
    });

    it("respects rule priority hierarchy strictly within enrolled students", () => {
      // Ana (st-1) and Bruno (st-2) are enrolled in Judo
      const enrolledIds = new Set(["st-1", "st-2"]);

      const generalRule: DomainChargeRuleRow = {
        id: "rule-gen",
        activity_id: activityId,
        academic_year_id: yearId,
        target_scope: "all_enrolled",
        monthly_amount: 15000,
        due_day: 10,
        months_count: 10,
        start_month: 9,
        recurrence: "monthly",
      };

      const specialStudentRule: DomainChargeRuleRow = {
        id: "rule-special-ana",
        activity_id: activityId,
        academic_year_id: yearId,
        target_scope: "students",
        monthly_amount: 10000,
        due_day: 10,
        months_count: 10,
        start_month: 9,
        recurrence: "monthly",
        activity_charge_rule_students: [{ student_id: "st-1" }],
      };

      const allRules = [generalRule, specialStudentRule];

      // For special rule, only Ana matches
      const specialMatched = studentsMatchingDomainChargeRule(
        specialStudentRule,
        yearId,
        enrolledIds,
        students,
        classrooms,
        allRules,
      );
      expect(specialMatched.map((s) => s.id)).toEqual(["st-1"]);

      // For general rule, only Bruno matches (Ana was captured by higher priority student rule)
      const generalMatched = studentsMatchingDomainChargeRule(
        generalRule,
        yearId,
        enrolledIds,
        students,
        classrooms,
        allRules,
      );
      expect(generalMatched.map((s) => s.id)).toEqual(["st-2"]);
    });
  });
});
