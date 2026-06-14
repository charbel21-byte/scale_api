const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();


app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.patch('/api/lists/:listId/senior-review', async (req, res) => {
  try {
    const listId = Number(req.params.listId);
    const body = req.body || {};

    const status = String(body.status || '').trim();
    const comment = String(body.comment || '').trim();
    const seniorId = String(body.seniorId || body.senior_id || '').trim();
    const seniorName = String(body.seniorName || body.senior_name || '').trim();

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.',
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required. JSON body was not received correctly.',
      });
    }

    if (!['approvedBySenior', 'rejectedBySenior'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid senior review status.',
      });
    }

    if (status === 'rejectedBySenior' && comment.isEmpty) {
      return res.status(400).json({
        success: false,
        message: 'Comment is required when rejecting a list.',
      });
    }

    const [existing] = await db.query(
      'SELECT id FROM engineer_lists WHERE id = ? LIMIT 1',
      [listId]
    );

    if (existing.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'List not found.',
      });
    }

    await db.query(
      `
      UPDATE engineer_lists
      SET
        status = ?,
        admin_comment = ?,
        admin_uid = ?,
        admin_decision_at = NOW()
      WHERE id = ?
      `,
      [status, comment, seniorId || seniorName, listId]
    );

    return res.json({
      success: true,
      message:
        status === 'approvedBySenior'
          ? 'List approved successfully.'
          : 'List rejected successfully.',
    });
  } catch (error) {
    console.error('Senior review error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to review list.',
      error: error.message,
    });
  }
});

app.use(express.json());
app.get('/api/lists/senior', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        el.id,
        el.project_id,
        p.name AS project_name,
        p.code AS project_code,

        el.engineer_uid AS engineer_id,
        u.full_name AS engineer_name,

        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        el.grand_total,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at
      FROM engineer_lists el
      LEFT JOIN projects p
        ON p.id = el.project_id
      LEFT JOIN users u
        ON u.id = el.engineer_uid
      WHERE el.status IN (
        'submitted',
        'approvedBySenior',
        'rejectedBySenior',
        'expired',
        'submittedByAccountant',
        'approvedByAdmin',
        'rejectedByAdmin'
      )
      ORDER BY el.created_at DESC
    `);

    return res.json({
      success: true,
      lists: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get senior engineer lists error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load engineer lists.',
      error: error.message,
    });
  }
});
app.use(express.json());
app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        employee_id,
        full_name,
        email,
        phone,
        address,
        role,
        active,
        created_at
      FROM users
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      employees: rows,
      data: rows
    });
  } catch (error) {
    console.error('Get employees error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load employees.',
      error: error.message
    });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const employeeId = String(req.body.employeeId || req.body.employee_id || '').trim();
    const fullName = String(req.body.fullName || req.body.full_name || '').trim();
    const email = String(req.body.email || '').trim();
    const phone = String(req.body.phone || '').trim();
    const address = String(req.body.address || '').trim();
    const role = String(req.body.role || '').trim();
    const password = String(req.body.password || '').trim();
    const createdById = String(req.body.createdById || '').trim();
    const createdByName = String(req.body.createdByName || '').trim();

    if (!employeeId || !fullName || !role || !password) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, full name, role, and password are required.'
      });
    }

    const [existing] = await db.query(
      'SELECT id FROM users WHERE employee_id = ? LIMIT 1',
      [employeeId]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Employee ID already exists.'
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO users (
        employee_id,
        full_name,
        email,
        phone,
        address,
        role,
        password,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, 1)
      `,
      [
        employeeId,
        fullName,
        email,
        phone,
        address,
        role,
        password
      ]
    );

    // Notification place:
    // If you already have notifyRole or OneSignal service, call it here AFTER insert.
    // Example:
    // await notifyRole(db, 'admin', 'Employee Created', `${fullName} was added by ${createdByName}`, {
    //   type: 'employee_created',
    //   employeeId: result.insertId,
    //   createdById
    // });

    return res.status(201).json({
      success: true,
      message: 'Employee created successfully.',
      employee: {
        id: result.insertId,
        employee_id: employeeId,
        full_name: fullName,
        email,
        phone,
        address,
        role,
        active: 1,
        createdById,
        createdByName
      }
    });
  } catch (error) {
    console.error('Create employee error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create employee.',
      error: error.message
    });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const fullName = String(req.body.fullName || req.body.full_name || '').trim();
    const phone = String(req.body.phone || '').trim();
    const address = String(req.body.address || '').trim();
    const role = String(req.body.role || '').trim();
    const active = req.body.active === true || req.body.active === 1 || req.body.active === '1' ? 1 : 0;

    if (!id || !fullName || !role) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID, full name, and role are required.'
      });
    }

    const [result] = await db.query(
      `
      UPDATE users
      SET full_name = ?, phone = ?, address = ?, role = ?, active = ?
      WHERE id = ?
      `,
      [fullName, phone, address, role, active, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Employee updated successfully.'
    });
  } catch (error) {
    console.error('Update employee error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update employee.',
      error: error.message
    });
  }
});

app.patch('/api/employees/:id/active', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const active = req.body.active === true || req.body.active === 1 || req.body.active === '1' ? 1 : 0;

    const [result] = await db.query(
      'UPDATE users SET active = ? WHERE id = ?',
      [active, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    return res.json({
      success: true,
      message: active ? 'Employee activated.' : 'Employee deactivated.'
    });
  } catch (error) {
    console.error('Toggle employee error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update employee status.',
      error: error.message
    });
  }
});

app.patch('/api/employees/:id/remove', async (req, res) => {
  try {
    const id = Number(req.params.id);

    const [result] = await db.query(
      'UPDATE users SET active = 0 WHERE id = ?',
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Employee not found.'
      });
    }

    return res.json({
      success: true,
      message: 'Employee removed successfully.'
    });
  } catch (error) {
    console.error('Remove employee error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to remove employee.',
      error: error.message
    });
  }
});
app.get('/api/projects', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        code,
        description,
        active,
        created_at
      FROM projects
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      projects: rows,
      data: rows
    });
  } catch (error) {
    console.error('Get projects error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load projects.',
      error: error.message
    });
  }
});

app.post('/api/projects', async (req, res) => {
  try {
    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim().toUpperCase();
    const description = String(req.body.description || '').trim();

    const engineerIds = Array.isArray(req.body.engineerIds)
      ? req.body.engineerIds
      : [];

    const foremanIds = Array.isArray(req.body.foremanIds)
      ? req.body.foremanIds
      : [];

    if (!name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Project name and code are required.'
      });
    }

    const [existing] = await db.query(
      'SELECT id FROM projects WHERE code = ? LIMIT 1',
      [code]
    );

    if (existing.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Project code already exists.'
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO projects (
        name,
        code,
        description,
        active
      )
      VALUES (?, ?, ?, 1)
      `,
      [name, code, description]
    );

    const projectId = result.insertId;

    for (const engineerId of engineerIds) {
      await db.query(
        `
        INSERT INTO project_assignments (
          project_id,
          user_id,
          role
        )
        VALUES (?, ?, ?)
        `,
        [projectId, engineerId, 'engineer']
      );
    }

    for (const foremanId of foremanIds) {
      await db.query(
        `
        INSERT INTO project_assignments (
          project_id,
          user_id,
          role
        )
        VALUES (?, ?, ?)
        `,
        [projectId, foremanId, 'foreman']
      );
    }

    return res.status(201).json({
      success: true,
      message: 'Project created successfully.',
      project: {
        id: projectId,
        name,
        code,
        description,
        active: 1,
        engineerIds,
        foremanIds
      }
    });
  } catch (error) {
    console.error('Create project error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create project.',
      error: error.message
    });
  }
});

app.put('/api/projects/:id', async (req, res) => {
  try {
    const projectId = Number(req.params.id);

    const name = String(req.body.name || '').trim();
    const code = String(req.body.code || '').trim().toUpperCase();
    const description = String(req.body.description || '').trim();

    const engineerIds = Array.isArray(req.body.engineerIds)
      ? req.body.engineerIds
      : [];

    const foremanIds = Array.isArray(req.body.foremanIds)
      ? req.body.foremanIds
      : [];

    if (!projectId || !name || !code) {
      return res.status(400).json({
        success: false,
        message: 'Project ID, name, and code are required.'
      });
    }

    const [result] = await db.query(
      `
      UPDATE projects
      SET name = ?, code = ?, description = ?
      WHERE id = ?
      `,
      [name, code, description, projectId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.'
      });
    }

    await db.query(
      'DELETE FROM project_assignments WHERE project_id = ?',
      [projectId]
    );

    for (const engineerId of engineerIds) {
      await db.query(
        `
        INSERT INTO project_assignments (
          project_id,
          user_id,
          role
        )
        VALUES (?, ?, ?)
        `,
        [projectId, engineerId, 'engineer']
      );
    }

    for (const foremanId of foremanIds) {
      await db.query(
        `
        INSERT INTO project_assignments (
          project_id,
          user_id,
          role
        )
        VALUES (?, ?, ?)
        `,
        [projectId, foremanId, 'foreman']
      );
    }

    return res.json({
      success: true,
      message: 'Project updated successfully.'
    });
  } catch (error) {
    console.error('Update project error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update project.',
      error: error.message
    });
  }
});

app.patch('/api/projects/:id/status', async (req, res) => {
  try {
    const projectId = Number(req.params.id);

    const active =
      req.body.active === true ||
      req.body.active === 1 ||
      req.body.active === '1'
        ? 1
        : 0;

    const [result] = await db.query(
      'UPDATE projects SET active = ? WHERE id = ?',
      [active, projectId]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Project not found.'
      });
    }

    return res.json({
      success: true,
      message: active ? 'Project activated.' : 'Project deactivated.'
    });
  } catch (error) {
    console.error('Update project status error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update project status.',
      error: error.message
    });
  }
});


const db = mysql.createPool({
  host: process.env.MYSQLHOST || process.env.DB_HOST || '127.0.0.1',
  user: process.env.MYSQLUSER || process.env.DB_USER || 'root',
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || '',
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || 'scale_app',
  port: Number(process.env.MYSQLPORT || process.env.DB_PORT || 3306),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
app.get('/api/engineer/projects', async (req, res) => {
  try {
    const engineerId = String(req.query.engineer_uid || req.query.engineerId || '').trim();

    if (!engineerId) {
      return res.status(400).json({
        success: false,
        message: 'Engineer ID is required.'
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        p.id,
        p.name,
        p.code,
        p.description,
        p.active,
        p.created_at
      FROM projects p
      INNER JOIN project_assignments pa
        ON pa.project_id = p.id
      WHERE pa.user_id = ?
        AND pa.role = 'engineer'
        AND p.active = 1
      ORDER BY p.name ASC
      `,
      [engineerId]
    );

    return res.json({
      success: true,
      projects: rows,
      data: rows
    });
  } catch (error) {
    console.error('Get engineer projects error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load engineer projects.',
      error: error.message
    });
  }
});
app.get('/api/users/by-role', async (req, res) => {
  try {
    const role = String(req.query.role || '').trim();
    const activeOnly = String(req.query.activeOnly || '1') === '1';

    if (!role) {
      return res.status(400).json({
        success: false,
        message: 'Role is required.',
      });
    }

    let sql = `
      SELECT
        id,
        employee_id,
        full_name,
        email,
        phone,
        address,
        role,
        active,
        created_at
      FROM users
      WHERE role = ?
    `;

    const params = [role];

    if (activeOnly) {
      sql += ` AND active = 1`;
    }

    sql += ` ORDER BY full_name ASC`;

    const [rows] = await db.query(sql, params);

    return res.json({
      success: true,
      users: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get users by role error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load users by role.',
      error: error.message,
    });
  }
});

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Scale API is running',
  });
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and password are required.',
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        id,
        employee_id,
        full_name,
        email,
        role,
        password,
        active
      FROM users
      WHERE employee_id = ?
      LIMIT 1
      `,
      [employeeId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Employee ID or password is incorrect.',
      });
    }

    const user = rows[0];

    if (String(user.password) !== String(password)) {
      return res.status(401).json({
        success: false,
        message: 'Employee ID or password is incorrect.',
      });
    }

    if (Number(user.active) !== 1) {
      return res.status(403).json({
        success: false,
        message: 'This account is inactive. Please contact the administrator.',
      });
    }

    return res.json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        employee_id: user.employee_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
        active: user.active,
      },
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
      error: error.message,
    });
  }
});
app.post('/api/daily-reports', async (req, res) => {
  try {
    const projectName = String(req.body.projectName || req.body.project_name || '').trim();
    const projectLocation = String(req.body.projectLocation || req.body.project_location || '').trim();
    const weather = String(req.body.weather || '').trim();
    const preparedBy = String(req.body.preparedBy || req.body.prepared_by || '').trim();
    const workCompleted = String(req.body.workCompleted || req.body.work_completed || '').trim();
    const workTomorrow = String(req.body.workTomorrow || req.body.work_tomorrow || '').trim();
    const safetyObservations = String(req.body.safetyObservations || req.body.safety_observations || '').trim();
    const delaysIssues = String(req.body.delaysIssues || req.body.delays_issues || '').trim();
    const engineerId = String(req.body.engineerId || req.body.engineer_id || '').trim();
    const engineerName = String(req.body.engineerName || req.body.engineer_name || '').trim();

    if (!projectName) {
      return res.status(400).json({
        success: false,
        message: 'Project name is required.',
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO daily_reports (
        project_name,
        project_location,
        weather,
        prepared_by,
        work_completed,
        work_tomorrow,
        safety_observations,
        delays_issues,
        engineer_id,
        engineer_name
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        projectName,
        projectLocation,
        weather,
        preparedBy,
        workCompleted,
        workTomorrow,
        safetyObservations,
        delaysIssues,
        engineerId,
        engineerName,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Daily report saved successfully.',
      report: {
        id: result.insertId,
        project_name: projectName,
        project_location: projectLocation,
        weather,
        prepared_by: preparedBy,
        work_completed: workCompleted,
        work_tomorrow: workTomorrow,
        safety_observations: safetyObservations,
        delays_issues: delaysIssues,
        engineer_id: engineerId,
        engineer_name: engineerName,
      },
    });
  } catch (error) {
    console.error('Create daily report error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create daily report.',
      error: error.message,
    });
  }
});

app.get('/api/daily-reports', async (req, res) => {
  try {
    const engineerId = String(req.query.engineerId || req.query.engineer_id || '').trim();

    let sql = `
      SELECT
        id,
        project_name,
        project_location,
        weather,
        prepared_by,
        work_completed,
        work_tomorrow,
        safety_observations,
        delays_issues,
        engineer_id,
        engineer_name,
        created_at,
        updated_at
      FROM daily_reports
    `;

    const params = [];

    if (engineerId) {
      sql += ` WHERE engineer_id = ?`;
      params.push(engineerId);
    }

    sql += ` ORDER BY created_at DESC`;

    const [rows] = await db.query(sql, params);

    return res.json({
      success: true,
      reports: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get daily reports error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load daily reports.',
      error: error.message,
    });
  }
});
app.post('/api/lists/expire-submitted', async (req, res) => {
  try {
    const [result] = await db.query(
      `
      UPDATE engineer_lists
      SET
        status = 'expired',
        updated_at = NOW()
      WHERE status = 'submitted'
        AND expires_at IS NOT NULL
        AND expires_at < NOW()
      `
    );

    return res.json({
      success: true,
      message: 'Submitted expired lists checked successfully.',
      affectedRows: result.affectedRows,
    });
  } catch (error) {
    console.error('Expire submitted lists error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to expire submitted lists.',
      error: error.message,
    });
  }
});
app.get('/api/accountant/lists/approved', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        el.id,
        el.project_id,
        p.name AS project_name,
        p.code AS project_code,
        el.engineer_uid AS engineer_id,
        u.full_name AS engineer_name,
        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        el.grand_total,
        el.senior_uid,
        el.senior_name,
        el.senior_comment,
        el.senior_decision_at,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at,
        COUNT(i.id) AS item_count
      FROM engineer_lists el
      LEFT JOIN projects p ON p.id = el.project_id
      LEFT JOIN users u ON u.id = el.engineer_uid
      LEFT JOIN engineer_list_items i ON i.list_id = el.id
      WHERE el.status IN (
        'approvedBySenior',
        'rejectedBySenior',
        'submittedByAccountant',
        'expired'
      )
      GROUP BY
        el.id,
        el.project_id,
        p.name,
        p.code,
        el.engineer_uid,
        u.full_name,
        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        el.grand_total,
        el.senior_uid,
        el.senior_name,
        el.senior_comment,
        el.senior_decision_at,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at
      ORDER BY el.updated_at DESC
    `);

    return res.json({
      success: true,
      lists: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get accountant approved lists error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load accountant approved lists.',
      error: error.message,
    });
  }
});
app.get('/api/accountant/lists/:listId/edit', async (req, res) => {
  try {
    const listId = Number(req.params.listId);

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.',
      });
    }

    const [lists] = await db.query(
      `
      SELECT
        el.id,
        el.project_id,
        p.name AS project_name,
        p.code AS project_code,
        el.engineer_uid AS engineer_id,
        u.full_name AS engineer_name,
        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        el.grand_total,
        el.senior_uid,
        el.senior_name,
        el.senior_comment,
        el.senior_decision_at,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at
      FROM engineer_lists el
      LEFT JOIN projects p ON p.id = el.project_id
      LEFT JOIN users u ON u.id = el.engineer_uid
      WHERE el.id = ?
      LIMIT 1
      `,
      [listId]
    );

    if (lists.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'List not found.',
      });
    }

    const [items] = await db.query(
      `
      SELECT
        id,
        list_id,
        name,
        qty,
        unit,
        COALESCE(price, 0) AS price,
        note,
        COALESCE(line_total, qty * COALESCE(price, 0)) AS line_total
      FROM engineer_list_items
      WHERE list_id = ?
      ORDER BY id ASC
      `,
      [listId]
    );

    return res.json({
      success: true,
      ...lists[0],
      items,
      data: {
        ...lists[0],
        items,
      },
    });
  } catch (error) {
    console.error('Get accountant list edit details error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load accountant list edit details.',
      error: error.message,
    });
  }
});
app.patch('/api/accountant/lists/:listId/save', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const listId = Number(req.params.listId);
    const body = req.body || {};

    const submit = body.submit === true || body.submit === 'true' || body.submit === 1;
    const status = submit ? 'submittedByAccountant' : 'approvedBySenior';

    const documentType = String(body.documentType || body.document_type || body.type || 'quotation').trim();
    const documentTitle = String(body.documentTitle || body.document_title || '').trim();
    const accountantComment = String(body.accountantComment || body.accountant_comment || '').trim();
    const accountantId = String(body.accountantId || body.accountant_id || '').trim();
    const accountantName = String(body.accountantName || body.accountant_name || '').trim();
    const grandTotal = Number(body.grandTotal || body.grand_total || 0);

    const items = Array.isArray(body.items) ? body.items : [];

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.',
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Items cannot be empty.',
      });
    }

    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT id, status FROM engineer_lists WHERE id = ? LIMIT 1',
      [listId]
    );

    if (existing.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: 'List not found.',
      });
    }

    await connection.query(
      `
      UPDATE engineer_lists
      SET
        status = ?,
        type = ?,
        grand_total = ?,
        submitted_to_admin_at = CASE WHEN ? = 1 THEN NOW() ELSE submitted_to_admin_at END,
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        status,
        documentType,
        grandTotal,
        submit ? 1 : 0,
        listId,
      ]
    );

    await connection.query(
      'DELETE FROM engineer_list_items WHERE list_id = ?',
      [listId]
    );

    for (const item of items) {
      const name = String(item.name || item.material || item.description || '').trim();
      const qty = Number(item.qty || item.quantity || 0);
      const unit = String(item.unit || '').trim();
      const price = Number(item.price || item.unitPrice || item.unit_price || 0);
      const note = String(item.note || item.notes || '').trim();
      const lineTotal = Number(item.lineTotal || item.line_total || qty * price);

      if (!name || qty <= 0) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: 'Each item must have a name and quantity.',
        });
      }

      await connection.query(
        `
        INSERT INTO engineer_list_items (
          list_id,
          name,
          qty,
          unit,
          price,
          note,
          line_total
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
        `,
        [
          listId,
          name,
          qty,
          unit,
          price,
          note,
          lineTotal,
        ]
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message: submit
        ? 'List submitted to admin successfully.'
        : 'List saved successfully.',
      status,
      grand_total: grandTotal,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    console.error('Save accountant list error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save accountant list.',
      error: error.message,
    });
  } finally {
    connection.release();
  }
});
app.get('/api/stock', async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        category,
        unit,
        quantity,
        minimum_quantity,
        location,
        active,
        created_at,
        updated_at
      FROM stock_items
      WHERE active = 1
      ORDER BY name ASC
      `
    );

    return res.json({
      success: true,
      data: rows,
      items: rows,
      stock: rows,
    });
  } catch (error) {
    console.error('Get stock error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load stock.',
      error: error.message,
    });
  }
});

app.get('/api/materials-stock', async (req, res) => {
  try {
    const [rows] = await db.query(
      `
      SELECT
        id,
        name,
        category,
        unit,
        quantity,
        minimum_quantity,
        location,
        active,
        created_at,
        updated_at
      FROM stock_items
      WHERE active = 1
      ORDER BY name ASC
      `
    );

    return res.json({
      success: true,
      data: rows,
      items: rows,
      stock: rows,
    });
  } catch (error) {
    console.error('Get materials stock error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load materials stock.',
      error: error.message,
    });
  }
});
// =========================
// STOCK ROUTES FOR FLUTTER
// =========================

app.get('/api/stock/items', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        category,
        unit,
        quantity,
        minimum_quantity,
        location,
        active,
        created_at,
        updated_at
      FROM stock_items
      WHERE active = 1
      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      items: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get stock items error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load stock items.',
      error: error.message,
    });
  }
});

app.post('/api/stock/items', async (req, res) => {
  try {
    const body = req.body || {};

    const name = String(body.name || '').trim();
    const category = String(body.category || '').trim();
    const unit = String(body.unit || '').trim();
    const quantity = Number(body.quantity || 0);
    const minimumQuantity = Number(
      body.minimumQuantity || body.minimum_quantity || 0,
    );
    const location = String(body.location || '').trim();
    const createdById = String(body.createdById || body.created_by_id || '').trim();
    const createdByName = String(body.createdByName || body.created_by_name || '').trim();
    const createdByRole = String(body.createdByRole || body.created_by_role || '').trim();

    if (!name || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Material name and unit are required.',
      });
    }

    const [result] = await db.query(
      `
      INSERT INTO stock_items (
        name,
        category,
        unit,
        quantity,
        minimum_quantity,
        location,
        active
      )
      VALUES (?, ?, ?, ?, ?, ?, 1)
      `,
      [
        name,
        category,
        unit,
        quantity,
        minimumQuantity,
        location,
      ]
    );

    return res.status(201).json({
      success: true,
      message: 'Stock item created successfully.',
      item: {
        id: result.insertId,
        name,
        category,
        unit,
        quantity,
        minimum_quantity: minimumQuantity,
        location,
        active: 1,
        createdById,
        createdByName,
        createdByRole,
      },
    });
  } catch (error) {
    console.error('Create stock item error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create stock item.',
      error: error.message,
    });
  }
});

app.put('/api/stock/items/:id', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body || {};

    const name = String(body.name || '').trim();
    const category = String(body.category || '').trim();
    const unit = String(body.unit || '').trim();
    const quantity = Number(body.quantity || 0);
    const minimumQuantity = Number(
      body.minimumQuantity || body.minimum_quantity || 0,
    );
    const location = String(body.location || '').trim();

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Stock item ID is required.',
      });
    }

    if (!name || !unit) {
      return res.status(400).json({
        success: false,
        message: 'Material name and unit are required.',
      });
    }

    const [result] = await db.query(
      `
      UPDATE stock_items
      SET
        name = ?,
        category = ?,
        unit = ?,
        quantity = ?,
        minimum_quantity = ?,
        location = ?
      WHERE id = ?
      `,
      [
        name,
        category,
        unit,
        quantity,
        minimumQuantity,
        location,
        id,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock item not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Stock item updated successfully.',
    });
  } catch (error) {
    console.error('Update stock item error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to update stock item.',
      error: error.message,
    });
  }
});

app.patch('/api/stock/items/:id/archive', async (req, res) => {
  try {
    const id = Number(req.params.id);

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Stock item ID is required.',
      });
    }

    const [result] = await db.query(
      `
      UPDATE stock_items
      SET active = 0
      WHERE id = ?
      `,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'Stock item not found.',
      });
    }

    return res.json({
      success: true,
      message: 'Stock item archived successfully.',
    });
  } catch (error) {
    console.error('Archive stock item error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to archive stock item.',
      error: error.message,
    });
  }
});

app.get('/api/stock/movements', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        stock_item_id,
        item_name,
        type,
        quantity,
        unit,
        project_id,
        project_name,
        note,
        created_by_uid,
        created_by_role,
        created_at
      FROM stock_movements
      ORDER BY created_at DESC
      LIMIT 300
    `);

    return res.json({
      success: true,
      movements: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get stock movements error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load stock movements.',
      error: error.message,
    });
  }
});

app.post('/api/stock/movements', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const body = req.body || {};

    const stockItemId = Number(body.stockItemId || body.stock_item_id || 0);
    const movementType = String(body.type || '').trim().toUpperCase();
    const quantity = Number(body.quantity || 0);
    const projectName = String(body.projectName || body.project_name || '').trim();
    const note = String(body.note || '').trim();
    const createdById = String(body.createdById || body.created_by_uid || '').trim();
    const createdByRole = String(body.createdByRole || body.created_by_role || '').trim();

    if (!stockItemId || !['IN', 'OUT'].includes(movementType) || quantity <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid stock movement data.',
      });
    }

    await connection.beginTransaction();

    const [items] = await connection.query(
      `
      SELECT *
      FROM stock_items
      WHERE id = ? AND active = 1
      FOR UPDATE
      `,
      [stockItemId]
    );

    if (items.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        message: 'Stock item not found.',
      });
    }

    const item = items[0];
    const currentQty = Number(item.quantity || 0);

    if (movementType === 'OUT' && currentQty < quantity) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        message: 'Not enough stock quantity.',
      });
    }

    const newQty =
      movementType === 'IN'
        ? currentQty + quantity
        : currentQty - quantity;

    await connection.query(
      `
      UPDATE stock_items
      SET quantity = ?
      WHERE id = ?
      `,
      [newQty, stockItemId]
    );

    const [result] = await connection.query(
      `
      INSERT INTO stock_movements (
        stock_item_id,
        item_name,
        type,
        quantity,
        unit,
        project_name,
        note,
        created_by_uid,
        created_by_role
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        stockItemId,
        item.name,
        movementType,
        quantity,
        item.unit,
        projectName,
        note,
        createdById,
        createdByRole,
      ]
    );

    await connection.commit();

    return res.status(201).json({
      success: true,
      message: 'Stock movement saved successfully.',
      movement_id: result.insertId,
      new_quantity: newQty,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    console.error('Create stock movement error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to create stock movement.',
      error: error.message,
    });
  } finally {
    connection.release();
  }
});
app.get('/api/payroll/preview', async (req, res) => {
  try {
    const startDate = String(
      req.query.startDate || req.query.start_date || ''
    ).trim();

    const endDate = String(
      req.query.endDate || req.query.end_date || ''
    ).trim();

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required.',
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        a.labor_id,
        a.labor_name,
        a.project_id,
        a.project_name,
        COUNT(DISTINCT a.date) AS days_worked,
        COALESCE(r.daily_rate, 0) AS daily_rate,
        GROUP_CONCAT(
          DISTINCT DATE_FORMAT(a.date, '%Y-%m-%d')
          ORDER BY a.date
          SEPARATOR ', '
        ) AS attendance_dates
      FROM attendance a
      LEFT JOIN labor_rates r
        ON r.labor_id = a.labor_id
      WHERE a.accountant_visible = 1
        AND a.date BETWEEN ? AND ?
      GROUP BY
        a.labor_id,
        a.labor_name,
        a.project_id,
        a.project_name,
        r.daily_rate
      ORDER BY a.labor_name ASC
      `,
      [startDate, endDate]
    );

    const data = rows.map((row) => {
      const daysWorked = Number(row.days_worked) || 0;
      const dailyRate = Number(row.daily_rate) || 0;

      return {
        ...row,
        days_worked: daysWorked,
        daily_rate: dailyRate,
        total_salary: daysWorked * dailyRate,
      };
    });

    return res.json({
      success: true,
      rows: data,
      items: data,
      data: data,
    });
  } catch (error) {
    console.error('Payroll preview error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to generate payroll preview.',
      error: error.message,
    });
  }
});
app.get('/api/payroll/preview', async (req, res) => {
  try {
    const startDate = String(
      req.query.startDate || req.query.start_date || ''
    ).trim();

    const endDate = String(
      req.query.endDate || req.query.end_date || ''
    ).trim();

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required.',
      });
    }

    const [rows] = await db.query(
      `
      SELECT
        a.project_id,
        COALESCE(NULLIF(a.project_name, ''), 'No Project') AS project_name,

        a.labor_id,
        COALESCE(NULLIF(a.labor_name, ''), a.labor_id) AS labor_name,

        COUNT(DISTINCT a.date) AS days_worked,

        COALESCE(r.daily_rate, 0) AS daily_rate,

        GROUP_CONCAT(
          DISTINCT DATE_FORMAT(a.date, '%Y-%m-%d')
          ORDER BY a.date
          SEPARATOR ', '
        ) AS attendance_dates,

        MIN(a.date) AS first_attendance_date,
        MAX(a.date) AS last_attendance_date,

        MIN(a.check_in_at) AS first_check_in,
        MAX(a.check_out_at) AS last_check_out
      FROM attendance a
      LEFT JOIN labor_rates r
        ON r.labor_id = a.labor_id
      WHERE a.accountant_visible = 1
        AND a.date BETWEEN ? AND ?
      GROUP BY
        a.project_id,
        a.project_name,
        a.labor_id,
        a.labor_name,
        r.daily_rate
      ORDER BY
        project_name ASC,
        labor_name ASC
      `,
      [startDate, endDate]
    );

    const data = rows.map((row) => {
      const daysWorked = Number(row.days_worked) || 0;
      const dailyRate = Number(row.daily_rate) || 0;

      return {
        ...row,
        days_worked: daysWorked,
        daily_rate: dailyRate,
        total_salary: daysWorked * dailyRate,
      };
    });

    return res.json({
      success: true,
      rows: data,
      items: data,
      data: data,
    });
  } catch (error) {
    console.error('Payroll preview error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to generate payroll preview.',
      error: error.message,
    });
  }
});
app.post('/api/payroll/submit-to-senior', async (req, res) => {
  const connection = await db.getConnection();

  try {
    const body = req.body || {};

    const startDate = String(body.startDate || body.start_date || '').trim();
    const endDate = String(body.endDate || body.end_date || '').trim();
    const createdById = String(body.createdById || body.created_by_uid || '').trim();
    const createdByName = String(body.createdByName || body.created_by_name || '').trim();

    const items = Array.isArray(body.items) ? body.items : [];

    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required.',
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Payroll items cannot be empty.',
      });
    }

    const periodKey = `${startDate}_to_${endDate}`;
    const laborCount = items.length;

    const grandTotal = items.reduce((sum, item) => {
      return sum + (Number(item.total_salary || item.totalSalary || 0) || 0);
    }, 0);

    await connection.beginTransaction();

    const [periodResult] = await connection.query(
      `
      INSERT INTO payroll_periods (
        period_key,
        start_date,
        end_date,
        status,
        labor_count,
        grand_total,
        created_by_uid
      )
      VALUES (?, ?, ?, 'submittedToSenior', ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = 'submittedToSenior',
        labor_count = VALUES(labor_count),
        grand_total = VALUES(grand_total),
        created_by_uid = VALUES(created_by_uid)
      `,
      [
        periodKey,
        startDate,
        endDate,
        laborCount,
        grandTotal,
        createdById || createdByName,
      ]
    );

    let payrollPeriodId = periodResult.insertId;

    if (!payrollPeriodId) {
      const [existingRows] = await connection.query(
        'SELECT id FROM payroll_periods WHERE period_key = ? LIMIT 1',
        [periodKey]
      );

      payrollPeriodId = existingRows[0].id;

      await connection.query(
        'DELETE FROM payroll_items WHERE payroll_period_id = ?',
        [payrollPeriodId]
      );
    }

    for (const item of items) {
      const laborId = String(item.labor_id || item.laborId || '').trim();
      const laborName = String(item.labor_name || item.laborName || '').trim();
      const projectId = String(item.project_id || item.projectId || '').trim();
      const projectName = String(item.project_name || item.projectName || '').trim();

      const daysWorked = Number(item.days_worked || item.daysWorked || 0);
      const dailyRate = Number(item.daily_rate || item.dailyRate || 0);
      const totalSalary = Number(item.total_salary || item.totalSalary || daysWorked * dailyRate);

      const attendanceDates = String(
        item.attendance_dates || item.attendanceDates || ''
      ).trim();

      const note = String(item.note || '').trim();

      if (!laborId || !laborName) {
        await connection.rollback();

        return res.status(400).json({
          success: false,
          message: 'Each payroll item must have labor ID and labor name.',
        });
      }

      await connection.query(
        `
        INSERT INTO payroll_items (
          payroll_period_id,
          labor_id,
          labor_name,
          project_id,
          project_name,
          days_worked,
          daily_rate,
          total_salary,
          attendance_dates,
          note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          payrollPeriodId,
          laborId,
          laborName,
          projectId,
          projectName,
          daysWorked,
          dailyRate,
          totalSalary,
          attendanceDates,
          note,
        ]
      );

      await connection.query(
        `
        INSERT INTO labor_rates (
          labor_id,
          labor_name,
          daily_rate,
          updated_by_uid
        )
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          labor_name = VALUES(labor_name),
          daily_rate = VALUES(daily_rate),
          updated_by_uid = VALUES(updated_by_uid)
        `,
        [
          laborId,
          laborName,
          dailyRate,
          createdById || createdByName,
        ]
      );
    }

    await connection.commit();

    return res.json({
      success: true,
      message: 'Payroll submitted to senior accountant successfully.',
      payroll_period_id: payrollPeriodId,
      status: 'submittedToSenior',
      labor_count: laborCount,
      grand_total: grandTotal,
    });
  } catch (error) {
    try {
      await connection.rollback();
    } catch (_) {}

    console.error('Submit payroll to senior error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to submit payroll to senior.',
      error: error.message,
    });
  } finally {
    connection.release();
  }
});
app.post('/api/payroll/labor-rate', async (req, res) => {
  try {
    const body = req.body || {};

    const laborId = String(body.laborId || body.labor_id || '').trim();
    const laborName = String(body.laborName || body.labor_name || '').trim();
    const dailyRate = Number(body.dailyRate || body.daily_rate || 0);

    const updatedById = String(
      body.updatedById || body.updated_by_uid || body.updatedByUid || ''
    ).trim();

    const updatedByName = String(
      body.updatedByName || body.updated_by_name || ''
    ).trim();

    if (!laborId) {
      return res.status(400).json({
        success: false,
        message: 'Labor ID is required.',
      });
    }

    if (dailyRate <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Daily salary must be greater than 0.',
      });
    }

    await db.query(
      `
      INSERT INTO labor_rates (
        labor_id,
        labor_name,
        daily_rate,
        updated_by_uid
      )
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        labor_name = VALUES(labor_name),
        daily_rate = VALUES(daily_rate),
        updated_by_uid = VALUES(updated_by_uid)
      `,
      [
        laborId,
        laborName,
        dailyRate,
        updatedById || updatedByName,
      ]
    );

    return res.json({
      success: true,
      message: 'Labor rate saved successfully.',
      labor_id: laborId,
      labor_name: laborName,
      daily_rate: dailyRate,
    });
  } catch (error) {
    console.error('Save labor rate error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save labor rate.',
      error: error.message,
    });
  }
});
// ============================================================
// SENIOR ACCOUNTANT - PAYROLL REVIEW
// ============================================================

app.get('/api/senior/payroll/periods', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        period_key,
        start_date,
        end_date,
        status,
        labor_count,
        grand_total,
        created_by_uid,
        created_at,
        updated_at
      FROM payroll_periods
      WHERE status IN (
        'submittedToSenior',
        'approvedBySenior',
        'rejectedBySenior'
      )
      ORDER BY created_at DESC
    `);

    return res.json({
      success: true,
      periods: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get senior payroll periods error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load senior payroll periods.',
      error: error.message,
    });
  }
});

app.get('/api/senior/payroll/periods/:id/items', async (req, res) => {
  try {
    const periodId = Number(req.params.id);

    if (!periodId) {
      return res.status(400).json({
        success: false,
        message: 'Payroll period ID is required.',
      });
    }

    const [periods] = await db.query(
      `
      SELECT
        id,
        period_key,
        start_date,
        end_date,
        status,
        labor_count,
        grand_total,
        created_by_uid,
        created_at,
        updated_at
      FROM payroll_periods
      WHERE id = ?
      LIMIT 1
      `,
      [periodId]
    );

    if (periods.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Payroll period not found.',
      });
    }

    const [items] = await db.query(
      `
      SELECT
        id,
        payroll_period_id,
        labor_id,
        labor_name,
        project_id,
        project_name,
        days_worked,
        daily_rate,
        total_salary,
        attendance_dates,
        note,
        created_at
      FROM payroll_items
      WHERE payroll_period_id = ?
      ORDER BY project_name ASC, labor_name ASC
      `,
      [periodId]
    );

    return res.json({
      success: true,
      period: periods[0],
      items: items,
      data: {
        ...periods[0],
        items: items,
      },
    });
  } catch (error) {
    console.error('Get senior payroll items error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load senior payroll items.',
      error: error.message,
    });
  }
});
// ============================================================
// PROJECTS - GENERAL LIST
// ============================================================
app.get('/api/projects', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        code,
        location,
        active,
        created_at,
        updated_at
      FROM projects
      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      projects: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get projects error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load projects.',
      error: error.message,
    });
  }
});

// ============================================================
// FOREMAN - PROJECTS
// ============================================================
// ============================================================
// FOREMAN - PROJECTS SAFE ROUTES
// ============================================================

async function loadForemanProjects(req, res) {
  try {
    const [rows] = await db.query(`
      SELECT
        id,
        name,
        code,
        location,
        active,
        created_at,
        updated_at
      FROM projects
      WHERE active = 1
      ORDER BY name ASC
    `);

    return res.json({
      success: true,
      projects: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get foreman projects error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load foreman projects.',
      error: error.message,
    });
  }
}

app.get('/api/foreman/projects', loadForemanProjects);
app.get('/api/foreman/:foremanId/projects', loadForemanProjects);
// ============================================================
// FOREMAN - PROJECT ATTENDANCE TODAY
// ============================================================
// ============================================================
// FOREMAN - PROJECT ATTENDANCE TODAY
// ============================================================
app.get('/api/attendance/project/:projectId/today', async (req, res) => {
  try {
    const projectId = String(req.params.projectId || '').trim();
    const date = String(req.query.date || '').trim();

    if (!projectId) {
      return res.status(400).json({
        success: false,
        message: 'Project ID is required.',
      });
    }

    const targetDate = date || new Date().toISOString().slice(0, 10);

    const [rows] = await db.query(
      `
      SELECT
        id,
        project_id,
        project_name,
        labor_id,
        labor_name,
        date,
        status,
        check_in_at,
        check_out_at,
        created_at,
        updated_at
      FROM attendance
      WHERE project_id = ?
        AND date = ?
      ORDER BY updated_at DESC
      `,
      [projectId, targetDate]
    );

    return res.json({
      success: true,
      attendance: rows,
      records: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get project attendance today error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load project attendance.',
      error: error.message,
    });
  }
});
// ============================================================
// ADMIN - FINAL APPROVALS LIST
// ============================================================
app.get('/api/admin/final-approvals', async (req, res) => {
  try {
    const [rows] = await db.query(`
      SELECT
        el.id,
        el.project_id,
        COALESCE(p.name, '-') AS project_name,
        COALESCE(p.code, '-') AS project_code,
        el.engineer_uid AS engineer_id,
        COALESCE(u.full_name, '-') AS engineer_name,
        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        COALESCE(el.grand_total, 0) AS grand_total,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at
      FROM engineer_lists el
      LEFT JOIN projects p ON p.id = el.project_id
      LEFT JOIN users u ON u.id = el.engineer_uid
      WHERE el.status IN (
        'submittedByAccountant',
        'approvedByAdmin',
        'rejectedByAdmin'
      )
      ORDER BY el.updated_at DESC
    `);

    return res.json({
      success: true,
      approvals: rows,
      lists: rows,
      data: rows,
    });
  } catch (error) {
    console.error('Get admin final approvals error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load final approvals.',
      error: error.message,
    });
  }
});


// ============================================================
// ADMIN - FINAL APPROVAL DETAILS
// ============================================================
app.get('/api/admin/lists/:listId/final-approval', async (req, res) => {
  try {
    const listId = Number(req.params.listId);

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.',
      });
    }

    const [lists] = await db.query(
      `
      SELECT
        el.id,
        el.project_id,
        COALESCE(p.name, '-') AS project_name,
        COALESCE(p.code, '-') AS project_code,
        el.engineer_uid AS engineer_id,
        COALESCE(u.full_name, '-') AS engineer_name,
        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        COALESCE(el.grand_total, 0) AS grand_total,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at
      FROM engineer_lists el
      LEFT JOIN projects p ON p.id = el.project_id
      LEFT JOIN users u ON u.id = el.engineer_uid
      WHERE el.id = ?
      LIMIT 1
      `,
      [listId]
    );

    if (lists.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'List not found.',
      });
    }

    const [items] = await db.query(
      `
      SELECT
        id,
        list_id,
        name,
        qty,
        unit,
        COALESCE(price, 0) AS price,
        note,
        COALESCE(line_total, qty * COALESCE(price, 0)) AS line_total
      FROM engineer_list_items
      WHERE list_id = ?
      ORDER BY id ASC
      `,
      [listId]
    );

    return res.json({
      success: true,
      ...lists[0],
      items,
      data: {
        ...lists[0],
        items,
      },
    });
  } catch (error) {
    console.error('Get admin final approval details error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load final approval details.',
      error: error.message,
    });
  }
});


// ============================================================
// ADMIN - SAVE FINAL DECISION
// ============================================================
app.patch('/api/admin/lists/:listId/final-decision', async (req, res) => {
  try {
    const listId = Number(req.params.listId);
    const body = req.body || {};

    const status = String(body.status || '').trim();
    const adminId = String(body.adminId || body.admin_id || '').trim();
    const adminName = String(body.adminName || body.admin_name || '').trim();
    const adminComment = String(body.adminComment || body.admin_comment || '').trim();

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.',
      });
    }

    if (!['approvedByAdmin', 'rejectedByAdmin'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid admin decision status.',
      });
    }

    if (status === 'rejectedByAdmin' && !adminComment) {
      return res.status(400).json({
        success: false,
        message: 'Admin comment is required when rejecting.',
      });
    }

    const [result] = await db.query(
      `
      UPDATE engineer_lists
      SET
        status = ?,
        admin_uid = ?,
        admin_comment = ?,
        admin_decision_at = NOW(),
        updated_at = NOW()
      WHERE id = ?
      `,
      [
        status,
        adminId || adminName,
        adminComment,
        listId,
      ]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({
        success: false,
        message: 'List not found.',
      });
    }

    return res.json({
      success: true,
      message:
        status === 'approvedByAdmin'
          ? 'Request finally approved successfully.'
          : 'Request rejected successfully.',
    });
  } catch (error) {
    console.error('Save admin final decision error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to save admin decision.',
      error: error.message,
    });
  }
});
app.listen(PORT, () => {
  console.log(`Scale API running on http://localhost:${PORT}`);
});
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
});

app.get('/api/test', (req, res) => {
  res.json({
    success: true,
    message: 'Backend API is working',
  });
});

app.get('/api/payroll', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM payroll ORDER BY created_at DESC'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to load payroll',
    });
  }
});

app.post('/api/payroll', async (req, res) => {
  try {
    const {
      labor_id,
      labor_name,
      project_id,
      project_name,
      period_start,
      period_end,
      days_worked,
      daily_rate,
      created_by_uid,
      created_by_role,
      firebase_period_id,
    } = req.body;

    if (!labor_id || !labor_name || !period_start || !period_end) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields',
      });
    }

    const total_salary = Number(days_worked) * Number(daily_rate);

    const sql = `
      INSERT INTO payroll (
        labor_id,
        labor_name,
        project_id,
        project_name,
        period_start,
        period_end,
        days_worked,
        daily_rate,
        total_salary,
        created_by_uid,
        created_by_role,
        firebase_period_id
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sql, [
      labor_id,
      labor_name,
      project_id,
      project_name,
      period_start,
      period_end,
      days_worked,
      daily_rate,
      total_salary,
      created_by_uid,
      created_by_role,
      firebase_period_id,
    ]);

    res.json({
      success: true,
      id: result.insertId,
      total_salary,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to save payroll',
    });
  }
});
app.get('/api/stock-items', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM stock_items WHERE active = 1 ORDER BY name ASC'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to load stock items',
    });
  }
});

app.post('/api/stock-items', async (req, res) => {
  try {
    const {
      name,
      category,
      unit,
      quantity,
      minimum_quantity,
      location,
      created_by_uid,
    } = req.body;

    if (!name || !unit) {
      return res.status(400).json({
        success: false,
        error: 'Name and unit are required',
      });
    }

    const sql = `
      INSERT INTO stock_items (
        name,
        category,
        unit,
        quantity,
        minimum_quantity,
        location,
        created_by_uid
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sql, [
      name,
      category || '',
      unit,
      Number(quantity) || 0,
      Number(minimum_quantity) || 0,
      location || '',
      created_by_uid || '',
    ]);

    res.json({
      success: true,
      id: result.insertId,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to save stock item',
    });
  }
});

app.put('/api/stock-items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const {
      name,
      category,
      unit,
      quantity,
      minimum_quantity,
      location,
    } = req.body;

    if (!name || !unit) {
      return res.status(400).json({
        success: false,
        error: 'Name and unit are required',
      });
    }
app.post('/api/auth/login', async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res.status(400).json({
        success: false,
        message: 'Employee ID and password are required.',
      });
    }

    const [rows] = await db.query(
      `
      SELECT 
        id,
        employee_id,
        full_name,
        email,
        role,
        password,
        active
      FROM users
      WHERE employee_id = ?
      LIMIT 1
      `,
      [employeeId]
    );

    if (rows.length === 0) {
      return res.status(401).json({
        success: false,
        message: 'Employee ID or password is incorrect.',
      });
    }

    const user = rows[0];

    if (String(user.password) !== String(password)) {
      return res.status(401).json({
        success: false,
        message: 'Employee ID or password is incorrect.',
      });
    }

    if (Number(user.active) !== 1) {
      return res.status(403).json({
        success: false,
        message: 'This account is inactive. Please contact the administrator.',
      });
    }

    return res.json({
      success: true,
      message: 'Login successful.',
      user: {
        id: user.id,
        employee_id: user.employee_id,
        full_name: user.full_name,
        email: user.email,
        role: user.role,
      },
    });
  } catch (error) {
    console.error('Login error:', error);

    return res.status(500).json({
      success: false,
      message: 'Server error during login.',
    });
  }
});
    const sql = `
      UPDATE stock_items
      SET
        name = ?,
        category = ?,
        unit = ?,
        quantity = ?,
        minimum_quantity = ?,
        location = ?
      WHERE id = ?
    `;

    await pool.execute(sql, [
      name,
      category || '',
      unit,
      Number(quantity) || 0,
      Number(minimum_quantity) || 0,
      location || '',
      id,
    ]);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to update stock item',
    });
  }
});

app.delete('/api/stock-items/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(
      'UPDATE stock_items SET active = 0 WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to archive stock item',
    });
  }
});
app.get('/api/stock-movements', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM stock_movements ORDER BY created_at DESC LIMIT 200'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to load stock movements',
    });
  }
});

app.post('/api/stock-movements', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      stock_item_id,
      type,
      quantity,
      project_id,
      project_name,
      note,
      created_by_uid,
      created_by_role,
    } = req.body;

    const movementType = String(type || '').toUpperCase();
    const qty = Number(quantity) || 0;

    if (!stock_item_id || !['IN', 'OUT'].includes(movementType) || qty <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid stock movement data',
      });
    }

    await connection.beginTransaction();

    const [items] = await connection.execute(
      'SELECT * FROM stock_items WHERE id = ? AND active = 1 FOR UPDATE',
      [stock_item_id]
    );

    if (items.length === 0) {
      await connection.rollback();

      return res.status(404).json({
        success: false,
        error: 'Stock item not found',
      });
    }

    const item = items[0];
    const currentQty = Number(item.quantity) || 0;

    if (movementType === 'OUT' && currentQty < qty) {
      await connection.rollback();

      return res.status(400).json({
        success: false,
        error: 'Not enough stock quantity',
      });
    }

    const newQty =
      movementType === 'IN'
        ? currentQty + qty
        : currentQty - qty;

    await connection.execute(
      'UPDATE stock_items SET quantity = ? WHERE id = ?',
      [newQty, stock_item_id]
    );

    const [result] = await connection.execute(
      `
      INSERT INTO stock_movements (
        stock_item_id,
        item_name,
        type,
        quantity,
        unit,
        project_id,
        project_name,
        note,
        created_by_uid,
        created_by_role
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        stock_item_id,
        item.name,
        movementType,
        qty,
        item.unit,
        project_id || '',
        project_name || '',
        note || '',
        created_by_uid || '',
        created_by_role || '',
      ]
    );

    await connection.commit();

    res.json({
      success: true,
      id: result.insertId,
      new_quantity: newQty,
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to save stock movement',
    });
  } finally {
    connection.release();
  }
});
app.get('/api/tools', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      'SELECT * FROM tools WHERE active = 1 ORDER BY name ASC'
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to load tools',
    });
  }
});

app.post('/api/tools', async (req, res) => {
  try {
    const {
      tool_code,
      name,
      category,
      status,
      assigned_project_id,
      assigned_project_name,
      assigned_to,
      location,
      note,
    } = req.body;

    if (!tool_code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Tool code and name are required',
      });
    }

    const sql = `
      INSERT INTO tools (
        tool_code,
        name,
        category,
        status,
        assigned_project_id,
        assigned_project_name,
        assigned_to,
        location,
        note
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    const [result] = await pool.execute(sql, [
      tool_code,
      name,
      category || '',
      status || 'available',
      assigned_project_id || '',
      assigned_project_name || '',
      assigned_to || '',
      location || 'Warehouse',
      note || '',
    ]);

    res.json({
      success: true,
      id: result.insertId,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Tool code already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to save tool',
    });
  }
});

app.put('/api/tools/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const {
      tool_code,
      name,
      category,
      status,
      assigned_project_id,
      assigned_project_name,
      assigned_to,
      location,
      note,
    } = req.body;

    if (!tool_code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Tool code and name are required',
      });
    }

    const sql = `
      UPDATE tools
      SET
        tool_code = ?,
        name = ?,
        category = ?,
        status = ?,
        assigned_project_id = ?,
        assigned_project_name = ?,
        assigned_to = ?,
        location = ?,
        note = ?
      WHERE id = ?
    `;

    await pool.execute(sql, [
      tool_code,
      name,
      category || '',
      status || 'available',
      assigned_project_id || '',
      assigned_project_name || '',
      assigned_to || '',
      location || 'Warehouse',
      note || '',
      id,
    ]);

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'Tool code already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update tool',
    });
  }
});

app.delete('/api/tools/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(
      'UPDATE tools SET active = 0, status = "lost" WHERE id = ?',
      [id]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      success: false,
      error: 'Failed to archive tool',
    });
  }
});
app.post('/api/attendance-scan', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      project_id,
      project_code,
      project_name,
      labor_id,
      labor_name,
      date,
      foreman_uid,
      foreman_name,
    } = req.body;

    if (!project_id || !labor_id || !date) {
      return res.status(400).json({
        success: false,
        error: 'Project ID, labor ID and date are required',
      });
    }

    await connection.beginTransaction();

    const [rows] = await connection.execute(
      `
      SELECT *
      FROM attendance
      WHERE project_id = ? AND date = ? AND labor_id = ?
      FOR UPDATE
      `,
      [project_id, date, labor_id]
    );

    if (rows.length === 0) {
      const [result] = await connection.execute(
        `
        INSERT INTO attendance (
          project_id,
          project_code,
          project_name,
          labor_id,
          labor_name,
          date,
          status,
          check_in_at,
          check_out_at,
          foreman_uid,
          foreman_name,
          accountant_visible
        )
        VALUES (?, ?, ?, ?, ?, ?, 'checkedIn', NOW(), NULL, ?, ?, 1)
        `,
        [
          project_id,
          project_code || project_id,
          project_name || '',
          labor_id,
          labor_name || labor_id,
          date,
          foreman_uid || '',
          foreman_name || '',
        ]
      );

      await connection.commit();

      return res.json({
        success: true,
        id: result.insertId,
        action: 'checkIn',
        status: 'checkedIn',
      });
    }

    const attendance = rows[0];

    if (attendance.status === 'checkedIn') {
      await connection.execute(
        `
        UPDATE attendance
        SET
          status = 'checkedOut',
          check_out_at = NOW(),
          foreman_uid = ?,
          foreman_name = ?
        WHERE id = ?
        `,
        [
          foreman_uid || '',
          foreman_name || '',
          attendance.id,
        ]
      );

      await connection.commit();

      return res.json({
        success: true,
        id: attendance.id,
        action: 'checkOut',
        status: 'checkedOut',
      });
    }

    await connection.rollback();

    return res.status(400).json({
      success: false,
      error: 'This labor already checked out today',
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to save attendance scan',
    });
  } finally {
    connection.release();
  }
});

app.get('/api/attendance-export', async (req, res) => {
  try {
    const projectCode = (req.query.project_code || '').toString().trim();
    const date = (req.query.date || '').toString().trim();

    if (!projectCode || !date) {
      return res.status(400).json({
        success: false,
        error: 'Project code and date are required',
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM attendance
      WHERE accountant_visible = 1
        AND date = ?
        AND (project_code = ? OR project_id = ?)
      ORDER BY check_in_at ASC
      `,
      [date, projectCode, projectCode]
    );

    res.json({
      success: true,
      project: rows.length > 0
        ? {
            project_id: rows[0].project_id,
            project_code: rows[0].project_code,
            project_name: rows[0].project_name,
          }
        : null,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load attendance export',
    });
  }
});
// =========================
// PAYROLL FROM ATTENDANCE
// =========================

app.post('/api/payroll/preview', async (req, res) => {
  try {
    const { start_date, end_date } = req.body;

    if (!start_date || !end_date) {
      return res.status(400).json({
        success: false,
        error: 'Start date and end date are required',
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        a.labor_id,
        a.labor_name,
        a.project_id,
        a.project_name,
        COUNT(DISTINCT a.date) AS days_worked,
        COALESCE(r.daily_rate, 0) AS daily_rate,
        GROUP_CONCAT(DISTINCT DATE_FORMAT(a.date, '%Y-%m-%d') ORDER BY a.date SEPARATOR ', ') AS attendance_dates
      FROM attendance a
      LEFT JOIN labor_rates r ON r.labor_id = a.labor_id
      WHERE a.accountant_visible = 1
        AND a.date BETWEEN ? AND ?
      GROUP BY
        a.labor_id,
        a.labor_name,
        a.project_id,
        a.project_name,
        r.daily_rate
      ORDER BY a.labor_name ASC
      `,
      [start_date, end_date]
    );

    const data = rows.map((row) => {
      const daysWorked = Number(row.days_worked) || 0;
      const dailyRate = Number(row.daily_rate) || 0;

      return {
        ...row,
        days_worked: daysWorked,
        daily_rate: dailyRate,
        total_salary: daysWorked * dailyRate,
      };
    });

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to generate payroll preview',
    });
  }
});

app.post('/api/labor-rates', async (req, res) => {
  try {
    const {
      labor_id,
      labor_name,
      daily_rate,
      updated_by_uid,
    } = req.body;

    if (!labor_id) {
      return res.status(400).json({
        success: false,
        error: 'Labor ID is required',
      });
    }

    const rate = Number(daily_rate) || 0;

    await pool.execute(
      `
      INSERT INTO labor_rates (
        labor_id,
        labor_name,
        daily_rate,
        updated_by_uid
      )
      VALUES (?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        labor_name = VALUES(labor_name),
        daily_rate = VALUES(daily_rate),
        updated_by_uid = VALUES(updated_by_uid)
      `,
      [
        labor_id,
        labor_name || '',
        rate,
        updated_by_uid || '',
      ]
    );

    res.json({
      success: true,
      daily_rate: rate,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to save labor rate',
    });
  }
});

app.post('/api/payroll/submit', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      start_date,
      end_date,
      created_by_uid,
      items,
    } = req.body;

    if (!start_date || !end_date || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid payroll data',
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Payroll items cannot be empty',
      });
    }

    const periodKey = `${start_date}_${end_date}`;
    const laborCount = items.length;
    const grandTotal = items.reduce((sum, item) => {
      return sum + (Number(item.total_salary) || 0);
    }, 0);

    await connection.beginTransaction();

    const [periodResult] = await connection.execute(
      `
      INSERT INTO payroll_periods (
        period_key,
        start_date,
        end_date,
        status,
        labor_count,
        grand_total,
        created_by_uid
      )
      VALUES (?, ?, ?, 'submittedToSenior', ?, ?, ?)
      ON DUPLICATE KEY UPDATE
        status = 'submittedToSenior',
        labor_count = VALUES(labor_count),
        grand_total = VALUES(grand_total),
        created_by_uid = VALUES(created_by_uid)
      `,
      [
        periodKey,
        start_date,
        end_date,
        laborCount,
        grandTotal,
        created_by_uid || '',
      ]
    );

    let payrollPeriodId = periodResult.insertId;

    if (!payrollPeriodId) {
      const [existingRows] = await connection.execute(
        'SELECT id FROM payroll_periods WHERE period_key = ? LIMIT 1',
        [periodKey]
      );

      payrollPeriodId = existingRows[0].id;

      await connection.execute(
        'DELETE FROM payroll_items WHERE payroll_period_id = ?',
        [payrollPeriodId]
      );
    }

    for (const item of items) {
      const daysWorked = Number(item.days_worked) || 0;
      const dailyRate = Number(item.daily_rate) || 0;
      const totalSalary = daysWorked * dailyRate;

      await connection.execute(
        `
        INSERT INTO payroll_items (
          payroll_period_id,
          labor_id,
          labor_name,
          project_id,
          project_name,
          days_worked,
          daily_rate,
          total_salary,
          attendance_dates,
          note
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        [
          payrollPeriodId,
          item.labor_id || '',
          item.labor_name || '',
          item.project_id || '',
          item.project_name || '',
          daysWorked,
          dailyRate,
          totalSalary,
          item.attendance_dates || '',
          item.note || '',
        ]
      );

      await connection.execute(
        `
        INSERT INTO labor_rates (
          labor_id,
          labor_name,
          daily_rate,
          updated_by_uid
        )
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
          labor_name = VALUES(labor_name),
          daily_rate = VALUES(daily_rate),
          updated_by_uid = VALUES(updated_by_uid)
        `,
        [
          item.labor_id || '',
          item.labor_name || '',
          dailyRate,
          created_by_uid || '',
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      payroll_period_id: payrollPeriodId,
      status: 'submittedToSenior',
      labor_count: laborCount,
      grand_total: grandTotal,
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to submit payroll',
    });
  } finally {
    connection.release();
  }
});

app.get('/api/payroll/periods', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT *
      FROM payroll_periods
      ORDER BY created_at DESC
      `
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load payroll periods',
    });
  }
});

app.get('/api/payroll/periods/:id/items', async (req, res) => {
  try {
    const { id } = req.params;

    const [rows] = await pool.execute(
      `
      SELECT *
      FROM payroll_items
      WHERE payroll_period_id = ?
      ORDER BY labor_name ASC
      `,
      [id]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load payroll items',
    });
  }
});
// =========================
// ENGINEER PROJECTS + LISTS
// =========================

app.get('/api/engineer/projects', async (req, res) => {
  try {
    const engineerUid = (req.query.engineer_uid || '').toString().trim();

    if (!engineerUid) {
      return res.status(400).json({
        success: false,
        error: 'Engineer UID is required',
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        p.id,
        p.firebase_project_id,
        p.code,
        p.name,
        p.description,
        p.active,
        p.created_at,
        p.updated_at
      FROM projects p
      INNER JOIN project_engineers pe ON pe.project_id = p.id
      WHERE pe.engineer_uid = ?
        AND p.active = 1
      ORDER BY p.name ASC
      `,
      [engineerUid]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load engineer projects',
    });
  }
});

app.get('/api/engineer/projects/:projectId/lists', async (req, res) => {
  try {
    const { projectId } = req.params;
    const engineerUid = (req.query.engineer_uid || '').toString().trim();

    if (!engineerUid) {
      return res.status(400).json({
        success: false,
        error: 'Engineer UID is required',
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        l.id,
        l.project_id,
        l.engineer_uid,
        l.title,
        l.status,
        l.list_date,
        l.expires_at,
        l.created_at,
        l.updated_at,
        COUNT(i.id) AS item_count
      FROM engineer_lists l
      LEFT JOIN engineer_list_items i ON i.list_id = l.id
      WHERE l.project_id = ?
        AND l.engineer_uid = ?
      GROUP BY
        l.id,
        l.project_id,
        l.engineer_uid,
        l.title,
        l.status,
        l.list_date,
        l.expires_at,
        l.created_at,
        l.updated_at
      ORDER BY l.created_at DESC
      `,
      [projectId, engineerUid]
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load engineer lists',
    });
  }
});

app.get('/api/engineer/lists/:listId', async (req, res) => {
  try {
    const listId = Number(req.params.listId);

    if (!listId) {
      return res.status(400).json({
        success: false,
        message: 'List ID is required.',
      });
    }

    const [lists] = await db.query(
      `
      SELECT
        el.id,
        el.project_id,
        p.name AS project_name,
        p.code AS project_code,
        el.engineer_uid AS engineer_id,
        u.full_name AS engineer_name,
        el.title,
        el.status,
        el.list_date,
        el.expires_at,
        el.created_at,
        el.updated_at,
        el.type,
        el.grand_total,
        el.submitted_to_admin_at,
        el.admin_uid,
        el.admin_comment,
        el.admin_decision_at
      FROM engineer_lists el
      LEFT JOIN projects p
        ON p.id = el.project_id
      LEFT JOIN users u
        ON u.id = el.engineer_uid
      WHERE el.id = ?
      LIMIT 1
      `,
      [listId]
    );

    if (lists.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'List not found.',
      });
    }

    const list = lists[0];

    const [items] = await db.query(
      `
      SELECT
        id,
        list_id,
        name,
        qty,
        unit,
        note
      FROM engineer_list_items
      WHERE list_id = ?
      ORDER BY id ASC
      `,
      [listId]
    );

    return res.json({
      success: true,
      data: {
        ...list,
        items: items,
      },
      list: {
        ...list,
        items: items,
      },
    });
  } catch (error) {
    console.error('Get engineer list details error:', error);

    return res.status(500).json({
      success: false,
      message: 'Failed to load list details.',
      error: error.message,
    });
  }
});
app.post('/api/engineer/lists', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const {
      project_id,
      engineer_uid,
      title,
      status,
      list_date,
      expires_at,
      items,
    } = req.body;

    if (!project_id || !engineer_uid || !title || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid engineer list data',
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one item is required',
      });
    }

    await connection.beginTransaction();

    const [result] = await connection.execute(
      `
      INSERT INTO engineer_lists (
        project_id,
        engineer_uid,
        title,
        status,
        list_date,
        expires_at
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        project_id,
        engineer_uid,
        title,
        status || 'draft',
        list_date,
        expires_at || null,
      ]
    );

    const listId = result.insertId;

    for (const item of items) {
      await connection.execute(
        `
        INSERT INTO engineer_list_items (
          list_id,
          name,
          qty,
          unit,
          note
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          listId,
          item.name || '',
          Number(item.qty) || 0,
          item.unit || '',
          item.note || '',
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
      id: listId,
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to save engineer list',
    });
  } finally {
    connection.release();
  }
});

app.put('/api/engineer/lists/:listId', async (req, res) => {
  const connection = await pool.getConnection();

  try {
    const { listId } = req.params;

    const {
      title,
      status,
      items,
    } = req.body;

    if (!title || !Array.isArray(items)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid engineer list data',
      });
    }

    if (items.length === 0) {
      return res.status(400).json({
        success: false,
        error: 'At least one item is required',
      });
    }

    await connection.beginTransaction();

    await connection.execute(
      `
      UPDATE engineer_lists
      SET
        title = ?,
        status = ?
      WHERE id = ?
      `,
      [
        title,
        status || 'draft',
        listId,
      ]
    );

    await connection.execute(
      'DELETE FROM engineer_list_items WHERE list_id = ?',
      [listId]
    );

    for (const item of items) {
      await connection.execute(
        `
        INSERT INTO engineer_list_items (
          list_id,
          name,
          qty,
          unit,
          note
        )
        VALUES (?, ?, ?, ?, ?)
        `,
        [
          listId,
          item.name || '',
          Number(item.qty) || 0,
          item.unit || '',
          item.note || '',
        ]
      );
    }

    await connection.commit();

    res.json({
      success: true,
    });
  } catch (error) {
    await connection.rollback();

    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to update engineer list',
    });
  } finally {
    connection.release();
  }
});
// =========================
// ADMIN FINAL APPROVALS
// =========================

app.get('/api/admin/final-approvals', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        l.id,
        l.project_id,
        p.code AS project_code,
        p.name AS project_name,
        l.engineer_uid,
        l.title,
        l.status,
        l.type,
        l.grand_total,
        l.list_date,
        l.created_at,
        l.updated_at,
        l.submitted_to_admin_at,
        COUNT(i.id) AS item_count
      FROM engineer_lists l
      LEFT JOIN projects p ON p.id = l.project_id
      LEFT JOIN engineer_list_items i ON i.list_id = l.id
      WHERE l.status = 'submittedByAccountant'
      GROUP BY
        l.id,
        l.project_id,
        p.code,
        p.name,
        l.engineer_uid,
        l.title,
        l.status,
        l.type,
        l.grand_total,
        l.list_date,
        l.created_at,
        l.updated_at,
        l.submitted_to_admin_at
      ORDER BY COALESCE(l.submitted_to_admin_at, l.updated_at, l.created_at) DESC
      `
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load final approvals',
    });
  }
});

app.get('/api/admin/final-approvals/:listId', async (req, res) => {
  try {
    const { listId } = req.params;

    const [lists] = await pool.execute(
      `
      SELECT
        l.*,
        p.code AS project_code,
        p.name AS project_name
      FROM engineer_lists l
      LEFT JOIN projects p ON p.id = l.project_id
      WHERE l.id = ?
      LIMIT 1
      `,
      [listId]
    );

    if (lists.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Approval request not found',
      });
    }

    const [items] = await pool.execute(
      `
      SELECT *
      FROM engineer_list_items
      WHERE list_id = ?
      ORDER BY id ASC
      `,
      [listId]
    );

    res.json({
      success: true,
      data: {
        ...lists[0],
        items,
      },
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load approval details',
    });
  }
});

app.post('/api/admin/final-approvals/:listId/decision', async (req, res) => {
  try {
    const { listId } = req.params;

    const {
      status,
      admin_uid,
      admin_comment,
    } = req.body;

    if (!['approvedByAdmin', 'rejectedByAdmin'].includes(status)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid admin decision status',
      });
    }

    if (status === 'rejectedByAdmin' && !admin_comment) {
      return res.status(400).json({
        success: false,
        error: 'Admin comment is required when rejecting',
      });
    }

    const [existingRows] = await pool.execute(
      `
      SELECT id, status
      FROM engineer_lists
      WHERE id = ?
      LIMIT 1
      `,
      [listId]
    );

    if (existingRows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Approval request not found',
      });
    }

    if (existingRows[0].status !== 'submittedByAccountant') {
      return res.status(400).json({
        success: false,
        error: 'This request is already processed',
      });
    }

    await pool.execute(
      `
      UPDATE engineer_lists
      SET
        status = ?,
        admin_uid = ?,
        admin_comment = ?,
        admin_decision_at = NOW()
      WHERE id = ?
      `,
      [
        status,
        admin_uid || '',
        admin_comment || '',
        listId,
      ]
    );

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to save admin decision',
    });
  }
});
// =========================
// EMPLOYEES
// =========================

app.get('/api/employees', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        id,
        employee_id,
        firebase_uid,
        full_name,
        email,
        phone,
        address,
        role,
        active,
        created_by_uid,
        created_at,
        updated_at,
        deactivated_at
      FROM employees
      ORDER BY created_at DESC
      `
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load employees',
    });
  }
});

app.post('/api/employees', async (req, res) => {
  try {
    const {
      employee_id,
      firebase_uid,
      full_name,
      email,
      phone,
      address,
      role,
      password,
      created_by_uid,
    } = req.body;

    if (!employee_id || !full_name || !role) {
      return res.status(400).json({
        success: false,
        error: 'Employee ID, full name and role are required',
      });
    }

    const allowedRoles = [
      'engineer',
      'foreman',
      'accountant',
      'seniorAccountant',
      'admin',
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid employee role',
      });
    }

    const [existing] = await pool.execute(
      `
      SELECT id
      FROM employees
      WHERE employee_id = ?
      LIMIT 1
      `,
      [employee_id]
    );

    if (existing.length > 0) {
      return res.status(400).json({
        success: false,
        error: 'This employee ID already exists',
      });
    }

    const generatedEmail = email || `${employee_id}@scale.local`;

    const [result] = await pool.execute(
      `
      INSERT INTO employees (
        employee_id,
        firebase_uid,
        full_name,
        email,
        phone,
        address,
        role,
        password_hash,
        active,
        created_by_uid
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
      `,
      [
        employee_id,
        firebase_uid || '',
        full_name,
        generatedEmail,
        phone || '',
        address || '',
        role,
        password || '',
        created_by_uid || '',
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      employee_id,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'This employee ID already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create employee',
    });
  }
});

app.put('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const {
      full_name,
      phone,
      address,
      role,
      active,
    } = req.body;

    if (!full_name || !role) {
      return res.status(400).json({
        success: false,
        error: 'Full name and role are required',
      });
    }

    const allowedRoles = [
      'engineer',
      'foreman',
      'accountant',
      'seniorAccountant',
      'admin',
    ];

    if (!allowedRoles.includes(role)) {
      return res.status(400).json({
        success: false,
        error: 'Invalid employee role',
      });
    }

    await pool.execute(
      `
      UPDATE employees
      SET
        full_name = ?,
        phone = ?,
        address = ?,
        role = ?,
        active = ?
      WHERE id = ?
      `,
      [
        full_name,
        phone || '',
        address || '',
        role,
        active == 0 ? 0 : 1,
        id,
      ]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to update employee',
    });
  }
});

app.patch('/api/employees/:id/active', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    const isActive = active == 1 || active === true;

    await pool.execute(
      `
      UPDATE employees
      SET
        active = ?,
        deactivated_at = ?
      WHERE id = ?
      `,
      [
        isActive ? 1 : 0,
        isActive ? null : new Date(),
        id,
      ]
    );

    res.json({
      success: true,
      active: isActive ? 1 : 0,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to update employee status',
    });
  }
});

app.delete('/api/employees/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(
      `
      UPDATE employees
      SET
        active = 0,
        deactivated_at = NOW()
      WHERE id = ?
      `,
      [id]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to remove employee',
    });
  }
});
// =========================
// LABORS
// =========================

app.get('/api/labors', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT *
      FROM labors
      ORDER BY created_at DESC
      `
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load labors',
    });
  }
});

app.post('/api/labors', async (req, res) => {
  try {
    const {
      labor_code,
      name,
      active,
      assigned_project_id,
      assigned_project_code,
      assigned_project_name,
    } = req.body;

    if (!labor_code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Labor code and name are required',
      });
    }

    const qrToken = crypto.randomBytes(32).toString('hex');

    const qrPayload = JSON.stringify({
      type: 'SCALE_LABOR_QR',
      labor_code,
      token: qrToken,
    });

    const [result] = await pool.execute(
      `
      INSERT INTO labors (
        labor_code,
        name,
        active,
        assigned_project_id,
        assigned_project_code,
        assigned_project_name,
        qr_token,
        qr_payload
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        labor_code,
        name,
        active == 0 ? 0 : 1,
        assigned_project_id || null,
        assigned_project_code || '',
        assigned_project_name || '',
        qrToken,
        qrPayload,
      ]
    );

    res.json({
      success: true,
      id: result.insertId,
      labor_code,
      qr_payload: qrPayload,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'This labor code already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to create labor',
    });
  }
});

app.put('/api/labors/:id', async (req, res) => {
  try {
    const { id } = req.params;

    const {
      labor_code,
      name,
      active,
      assigned_project_id,
      assigned_project_code,
      assigned_project_name,
    } = req.body;

    if (!labor_code || !name) {
      return res.status(400).json({
        success: false,
        error: 'Labor code and name are required',
      });
    }

    await pool.execute(
      `
      UPDATE labors
      SET
        labor_code = ?,
        name = ?,
        active = ?,
        assigned_project_id = ?,
        assigned_project_code = ?,
        assigned_project_name = ?
      WHERE id = ?
      `,
      [
        labor_code,
        name,
        active == 0 ? 0 : 1,
        assigned_project_id || null,
        assigned_project_code || '',
        assigned_project_name || '',
        id,
      ]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({
        success: false,
        error: 'This labor code already exists',
      });
    }

    res.status(500).json({
      success: false,
      error: 'Failed to update labor',
    });
  }
});

app.patch('/api/labors/:id/active', async (req, res) => {
  try {
    const { id } = req.params;
    const { active } = req.body;

    const isActive = active == 1 || active === true;

    await pool.execute(
      `
      UPDATE labors
      SET active = ?
      WHERE id = ?
      `,
      [
        isActive ? 1 : 0,
        id,
      ]
    );

    res.json({
      success: true,
      active: isActive ? 1 : 0,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to update labor status',
    });
  }
});

app.patch('/api/labors/:id/unassign', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(
      `
      UPDATE labors
      SET
        assigned_project_id = NULL,
        assigned_project_code = '',
        assigned_project_name = ''
      WHERE id = ?
      `,
      [id]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to unassign labor',
    });
  }
});

app.delete('/api/labors/:id', async (req, res) => {
  try {
    const { id } = req.params;

    await pool.execute(
      `
      UPDATE labors
      SET active = 0
      WHERE id = ?
      `,
      [id]
    );

    res.json({
      success: true,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to remove labor',
    });
  }
});
// =========================
// ACTIVE PROJECTS FOR LABOR ASSIGNMENT
// =========================

app.get('/api/projects/active', async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `
      SELECT
        id,
        code,
        name,
        description,
        active
      FROM projects
      WHERE active = 1
      ORDER BY name ASC
      `
    );

    res.json({
      success: true,
      data: rows,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      error: 'Failed to load active projects',
    });
  }
});

app.post('/api/labors/verify-qr', async (req, res) => {
  try {
    const { qr_data } = req.body;

    if (!qr_data) {
      return res.status(400).json({
        success: false,
        valid: false,
        error: 'QR data is required',
      });
    }

    let parsed;

    try {
      parsed = JSON.parse(qr_data);
    } catch (_) {
      return res.status(400).json({
        success: true,
        valid: false,
        error: 'Invalid QR format',
      });
    }

    if (
      parsed.type !== 'SCALE_LABOR_QR' ||
      !parsed.labor_code ||
      !parsed.token
    ) {
      return res.json({
        success: true,
        valid: false,
        error: 'This QR code does not belong to the system',
      });
    }

    const [rows] = await pool.execute(
      `
      SELECT
        id,
        labor_code,
        name,
        active,
        assigned_project_id,
        assigned_project_code,
        assigned_project_name
      FROM labors
      WHERE labor_code = ?
        AND qr_token = ?
      LIMIT 1
      `,
      [parsed.labor_code, parsed.token]
    );

    if (rows.length === 0) {
      return res.json({
        success: true,
        valid: false,
        error: 'QR code not recognized',
      });
    }

    const labor = rows[0];

    if (labor.active != 1) {
      return res.json({
        success: true,
        valid: false,
        error: 'Labor is inactive',
      });
    }

    res.json({
      success: true,
      valid: true,
      labor,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      success: false,
      valid: false,
      error: 'Failed to verify QR code',
    });
  }
});
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Scale API running on port ${PORT}`);
});