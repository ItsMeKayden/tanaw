import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { hash } from "bcryptjs";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL!,
});

const prisma = new PrismaClient({ adapter });

const applicants = [
  { first: "Juan", last: "Dela Cruz", middle: "Santos", sex: "Male", score: 8 },
  { first: "Maria", last: "Santos", middle: "Reyes", sex: "Female", score: 9 },
  { first: "Pedro", last: "Garcia", middle: "Lopez", sex: "Male", score: 6 },
  { first: "Ana", last: "Reyes", middle: "Cruz", sex: "Female", score: 7 },
  { first: "Mark", last: "Mendoza", middle: "Ramos", sex: "Male", score: 9 },
  { first: "Sofia", last: "Torres", middle: "Dizon", sex: "Female", score: 5 },
  {
    first: "Daniel",
    last: "Flores",
    middle: "Bautista",
    sex: "Male",
    score: 10,
  },
  {
    first: "Angela",
    last: "Castillo",
    middle: "Rivera",
    sex: "Female",
    score: 7,
  },
  {
    first: "Miguel",
    last: "Aquino",
    middle: "Villanueva",
    sex: "Male",
    score: 6,
  },
  {
    first: "Isabella",
    last: "Ramos",
    middle: "Fernandez",
    sex: "Female",
    score: 8,
  },
];

const stageNames = [
  "Application Submitted",
  "For Examination",
  "Exam Completed",
  "For Evaluation",
  "Failed",
  "Enrolled",
];

const districtBarangays = [
  {
    district: "District 1",
    barangays: [
      "Alicia",
      "Bagong Pag-asa",
      "Bahay Toro",
      "Balingasa",
      "Bungad",
      "Damar",
      "Damayan",
      "Del Monte",
      "Katipunan",
      "Lourdes",
      "Maharlika",
      "Manresa",
      "Mariblo",
      "Masambong",
      "N.S. Amoranto",
      "Nayong Kanluran",
      "Paang Bundok",
      "Pag-ibig sa Nayon",
      "Paltok",
      "Paraiso",
      "Phil-am",
      "Project 6",
      "Ramon Magsaysay",
      "Salvacion",
      "San Antonio",
      "San Isidro Labrador",
      "San Jose",
      "Siena",
      "St. Peter",
      "Sta. Cruz",
      "Sta. Teresita",
      "Sto. Cristo",
      "Sto. Domingo",
      "Talayan",
      "Vasra",
      "Veterans Village",
      "West Triangle",
    ],
  },
  {
    district: "District 2",
    barangays: [
      "Bagong Silangan",
      "Batasan Hills",
      "Commonwealth",
      "Holy Spirit",
      "Payatas",
    ],
  },
  {
    district: "District 3",
    barangays: [
      "Amihan",
      "Bagumbayan",
      "Bagumbuhay",
      "Bayanihan",
      "Blue Ridge A",
      "Blue Ridge B",
      "Camp Aguinaldo",
      "Dioquino Zobel",
      "Duyan-Duyan",
      "E. Rodriguez",
      "East Kamias",
      "Escopa I",
      "Escopa II",
      "Escopa III",
      "Escopa IV",
      "Libis",
      "Loyola Heights",
      "Mangga",
      "Marilag",
      "Masagana",
      "Matandang Balara",
      "Milagrosa",
      "Pansol",
      "Quirino 2-A",
      "Quirino 2-B",
      "Quirino 2-C",
      "Quirino 3-A",
      "Quirino 3-B (Claro)",
      "San Roque",
      "Silangan",
      "Socorro",
      "St. Ignatius",
      "Tagumpay",
      "Ugong Norte",
      "Villa Maria Clara",
      "West Kamias",
      "White Plains",
    ],
  },
  {
    district: "District 4",
    barangays: [
      "Bagong Lipunan ng Crame",
      "Botocan",
      "Central",
      "Damayang Lagi",
      "Don Manuel",
      "Doña Aurora",
      "Doña Imelda",
      "Doña Josefa",
      "Horseshoe",
      "Immaculate Concepcion",
      "Kalusugan",
      "Kamuning",
      "Kaunlaran",
      "Kristong Hari",
      "Krus na Ligas",
      "Laging Handa",
      "Malaya",
      "Mariana",
      "Obrero",
      "Old Capitol Site",
      "Paligsahan",
      "Pinagkaisahan",
      "Pinyahan",
      "Roxas",
      "Sacred Heart",
      "San Isidro Galas",
      "San Martin de Porres",
      "San Vicente",
      "Santol",
      "Sikatuna Village",
      "South Triangle",
      "Sto. Niño",
      "Tatalon",
      "Teachers' Village East",
      "Teachers' Village West",
      "UP Campus",
      "UP Village",
      "Valencia",
    ],
  },
  {
    district: "District 5",
    barangays: [
      "Bagbag",
      "Capri",
      "Fairview",
      "Greater Lagro",
      "Gulod",
      "Kaligayahan",
      "Nagkaisang Nayon",
      "North Fairview",
      "Novaliches Proper",
      "Pasong Putik Proper",
      "San Agustin",
      "San Bartolome",
      "Sta. Lucia",
      "Sta. Monica",
    ],
  },
  {
    district: "District 6",
    barangays: [
      "Apolonio Samson",
      "Baesa",
      "Balon Bato",
      "Culiat",
      "New Era",
      "Pasong Tamo",
      "Sangandaan",
      "Sauyo",
      "Talipapa",
      "Tandang Sora",
      "Unang Sigaw",
    ],
  },
];

async function seedDistrictsAndBarangays() {
  console.log("Seeding Quezon City districts and barangays...");

  let totalBarangays = 0;

  for (const item of districtBarangays) {
    // Find or create the district.
    let district = await prisma.tbl_district.findFirst({
      where: { district_name: item.district },
    });

    if (!district) {
      district = await prisma.tbl_district.create({
        data: {
          district_name: item.district,
        },
      });
    }

    // Find or create each barangay under its district.
    for (const barangayName of item.barangays) {
      const existingBarangay = await prisma.tbl_barangay.findFirst({
        where: {
          barangay_name: barangayName,
          district_id: district.district_id,
        },
      });

      if (!existingBarangay) {
        await prisma.tbl_barangay.create({
          data: {
            barangay_name: barangayName,
            district_id: district.district_id,
          },
        });
      }

      totalBarangays++;
    }
  }

  console.log("Districts ready: 6");
  console.log(`Barangays processed: ${totalBarangays}`);
}

const campuses = [
  {
    branch_code: "SB",
    branch_name: "San Bartolome Campus",
  },
  {
    branch_code: "SF",
    branch_name: "San Francisco Campus",
  },
  {
    branch_code: "BAT",
    branch_name: "Batasan Campus",
  },
];

const programs = [
  {
    program_code: "BSA",
    program_name: "BS Accountancy",
  },
  {
    program_code: "BSEntrep",
    program_name: "BS Entrepreneurship",
  },
  {
    program_code: "BECEd",
    program_name: "Bachelor in Early Childhood Education",
  },
  {
    program_code: "BSECE",
    program_name: "BS Electronics Engineering",
  },
  {
    program_code: "BSIE",
    program_name: "BS Industrial Engineering",
  },
  {
    program_code: "BSIT",
    program_name: "BS Information Technology",
  },
  {
    program_code: "BSMA",
    program_name: "BS Management Accounting",
  },
];

async function seedCampusesAndPrograms() {
  console.log("Seeding QCU campuses and programs...");

  // Create or reuse campuses
  for (const campus of campuses) {
    const existing = await prisma.tbl_branch.findFirst({
      where: { branch_code: campus.branch_code },
    });

    if (!existing) {
      await prisma.tbl_branch.create({
        data: {
          branch_code: campus.branch_code,
          branch_name: campus.branch_name,
          is_active: true,
        },
      });
    }
  }

  // Create or reuse academic programs
  for (const program of programs) {
    const existing = await prisma.tbl_program.findFirst({
      where: { program_code: program.program_code },
    });

    if (!existing) {
      await prisma.tbl_program.create({
        data: {
          program_code: program.program_code,
          program_name: program.program_name,
          is_active: true,
        },
      });
    }
  }

  console.log("Campuses ready: 3");
  console.log(`Programs ready: ${programs.length}`);
}

async function seedRolesAndPermissions() {
  console.log("Seeding TANAW roles and permissions...");

  const roles = [
    {
      role_name: "SYSTEM_ADMIN",
      description: "Full system administrator access.",
    },
    {
      role_name: "PRESIDENT",
      description: "Read-only access to all modules.",
    },
    {
      role_name: "ADMISSION",
      description: "Manages admission operations.",
    },
    {
      role_name: "REGISTRAR",
      description: "Manages registrar operations.",
    },
    {
      role_name: "GUIDANCE",
      description: "Manages guidance operations.",
    },
  ];

  const modules = [
    "DASHBOARD",
    "MAP",
    "ADMISSION",
    "COURSE",
    "USERS",
    "REGISTRAR",
    "GUIDANCE",
    "REPORTS",
  ] as const;

  const permissionTypes = ["READ", "WRITE"] as const;

  // Create or update roles.
  const roleRecords = new Map<string, number>();

  for (const role of roles) {
    const record = await prisma.tbl_role.upsert({
      where: { role_name: role.role_name },
      update: { description: role.description },
      create: role,
    });

    roleRecords.set(role.role_name, record.role_id);
  }

  // Create or update module permissions.
  const permissionRecords = new Map<string, number>();

  for (const module of modules) {
    for (const permissionType of permissionTypes) {
      const permissionCode = `${module}_${permissionType}`;

      const record = await prisma.tbl_permission.upsert({
        where: { permission_code: permissionCode },
        update: {
          module_name: module,
        },
        create: {
          permission_code: permissionCode,
          module_name: module,
          description: `${permissionType} access for the ${module} module.`,
        },
      });

      permissionRecords.set(permissionCode, record.permission_id);
    }
  }

  // Define the permissions assigned to each role.
  const roleAccess: Record<string, Record<string, string[]>> = {
    SYSTEM_ADMIN: Object.fromEntries(
      modules.map((module) => [module, ["READ", "WRITE"]]),
    ),

    PRESIDENT: Object.fromEntries(modules.map((module) => [module, ["READ"]])),

    ADMISSION: {
      DASHBOARD: ["READ"],
      MAP: ["READ"],
      ADMISSION: ["READ", "WRITE"],
      COURSE: ["READ"],
      USERS: ["READ"],
      REPORTS: ["READ", "WRITE"],
    },

    REGISTRAR: {
      DASHBOARD: ["READ"],
      MAP: ["READ"],
      COURSE: ["READ"],
      USERS: ["READ"],
      REGISTRAR: ["READ", "WRITE"],
      REPORTS: ["READ", "WRITE"],
    },

    GUIDANCE: {
      DASHBOARD: ["READ"],
      MAP: ["READ"],
      COURSE: ["READ"],
      USERS: ["READ"],
      GUIDANCE: ["READ", "WRITE"],
      REPORTS: ["READ", "WRITE"],
    },
  };

  // Create or reuse role-permission assignments.
  for (const [roleName, modulePermissions] of Object.entries(roleAccess)) {
    const roleId = roleRecords.get(roleName);

    if (!roleId) {
      throw new Error(`Role not found: ${roleName}`);
    }

    for (const [module, permissionTypes] of Object.entries(modulePermissions)) {
      for (const permissionType of permissionTypes) {
        const permissionCode = `${module}_${permissionType}`;
        const permissionId = permissionRecords.get(permissionCode);

        if (!permissionId) {
          throw new Error(`Permission not found: ${permissionCode}`);
        }

        await prisma.tbl_role_permission.upsert({
          where: {
            role_id_permission_id: {
              role_id: roleId,
              permission_id: permissionId,
            },
          },
          update: {},
          create: {
            role_id: roleId,
            permission_id: permissionId,
          },
        });
      }
    }
  }

  console.log("Roles ready: 5");
  console.log("Permissions ready: 16");
  console.log("Role-permission assignments ready.");
}

async function main() {
  await seedRolesAndPermissions();
  await seedSystemAdmin();
}

async function seedSystemAdmin() {
  console.log("Seeding SYSTEM_ADMIN account...");

  const name = "System Admin";
  const username = "systemadmin";
  const email = "systemadmin@tanaw.com";

  const role = await prisma.tbl_role.findUnique({
    where: { role_name: "SYSTEM_ADMIN" },
  });

  if (!role) {
    throw new Error(
      "SYSTEM_ADMIN role not found. Seed roles and permissions first.",
    );
  }

  const existingAccount = await prisma.tbl_user_account.findFirst({
    where: {
      OR: [{ username }, { email }],
    },
  });

  if (existingAccount) {
    console.log("SYSTEM_ADMIN account already exists. Skipping creation.");
    return;
  }

  const password = process.env.SYSTEM_ADMIN_PASSWORD;

  if (!password || password.length < 8 || password.length > 72) {
    throw new Error(
      "SYSTEM_ADMIN_PASSWORD must be between 8 and 72 characters.",
    );
  }

  const hashedPassword = await hash(password, 12);

  await prisma.tbl_user_account.create({
    data: {
      username,
      email,
      full_name: name,
      password_hash: hashedPassword,
      role_id: role.role_id,
      is_active: true,
    },
  });

  console.log("SYSTEM_ADMIN account created successfully.");
}

main()
  .catch((error) => {
    console.error("Seeding failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
