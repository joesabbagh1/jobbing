-- One master CV per language: the existing master CV moves to the key of the language it's written in.
UPDATE `settings` SET `key` = 'masterCv.' || coalesce(json_extract(`value`, '$.language'), 'en') WHERE `key` = 'masterCv';
