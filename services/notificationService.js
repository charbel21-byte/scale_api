const { notifyRole } = require('../services/notificationService');

router.post('/engineer-lists', async (req, res) => {
  const connection = await db.getConnection();

  try {
    await connection.beginTransaction();

    const {
      projectId,
      engineerUid,
      title,
      status,
      listDate,
      expiresAt,
      items,
    } = req.body;

    const [result] = await connection.query(
      `
      INSERT INTO engineer_lists
      (project_id, engineer_id, title, status, list_date, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [projectId, engineerUid, title, status, listDate, expiresAt]
    );

    const listId = result.insertId;

    for (const item of items) {
      await connection.query(
        `
        INSERT INTO engineer_list_items
        (list_id, name, qty, unit, note)
        VALUES (?, ?, ?, ?, ?)
        `,
        [listId, item.name, item.qty, item.unit, item.note || '']
      );
    }

    await connection.commit();

    if (status === 'submitted') {
      await notifyRole(
        db,
        'seniorAccountant',
        'New Material List',
        `Engineer submitted a new list: ${title}`,
        {
          type: 'material_list_submitted',
          listId,
          projectId,
        }
      );
    }

    res.json({
      success: true,
      listId,
    });
  } catch (error) {
    await connection.rollback();

    res.status(500).json({
      success: false,
      message: error.message,
    });
  } finally {
    connection.release();
  }
});