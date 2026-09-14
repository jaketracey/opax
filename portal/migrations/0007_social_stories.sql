-- Stories are two more channels (each edition's frames as Instagram and Facebook
-- Page stories), and a delivery made of several frames keeps its progress so a
-- resumed run never repeats one. SQLite cannot widen a CHECK, so the journal is
-- rebuilt with its rows carried over.
CREATE TABLE social_deliveries_next (
 edition_date TEXT NOT NULL REFERENCES social_editions(date),
 channel TEXT NOT NULL CHECK(channel IN ('x','facebook','instagram','instagram_story','facebook_story')),
 status TEXT NOT NULL CHECK(status IN ('sending','preparing','posted','failed','review_required')),
 post_id TEXT,
 container_id TEXT,
 detail TEXT,
 progress TEXT,
 updated_at TEXT NOT NULL,
 PRIMARY KEY(edition_date,channel)
);
INSERT INTO social_deliveries_next (edition_date,channel,status,post_id,container_id,detail,updated_at)
 SELECT edition_date,channel,status,post_id,container_id,detail,updated_at FROM social_deliveries;
DROP TABLE social_deliveries;
ALTER TABLE social_deliveries_next RENAME TO social_deliveries;
