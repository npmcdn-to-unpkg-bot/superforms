function User() {
	var config = require('../config');
	var bcrypt = require('bcryptjs');
	var db = require('./db.js');
	var Object = require('../libs/improvedObject');
	var Hashids = require("hashids");
	var hashids = {
		user : new Hashids(config.get('hash:user:salt'), config.get('hash:user:length')),
		registration : new Hashids(config.get('hash:user:salt'), config.get('hash:regConfirm:length')),
		recovery : new Hashids(config.get('hash:user:salt'), config.get('hash:regConfirm:length'))
	}
	
	var self = this;
	this.table = 'users';
	this.name = 'user';

	this.findByMail = function (email) {
		return db.query('SELECT * FROM users WHERE email = $1;', [email]);
	}

	this.findOne = function (id) {
		return db.query(
			'SELECT users.*, status.name AS status, status.id AS status_id, logs.changed AS status_changed\
			FROM user_status_logs AS logs\
			JOIN users ON users.id = logs.user_id\
			JOIN status ON status.id = logs.status_id\
			WHERE logs.changed = (SELECT MAX(changed) FROM user_status_logs logs WHERE logs.user_id = $1);', 
			[id]);
	}


	this.findAll = function () {
		return db.query(
			'SELECT users.*, status.name AS status, status.id AS status_id, logs.changed AS status_changed\
			FROM user_status_logs AS logs\
			JOIN users ON users.id = logs.user_id\
			JOIN status ON status.id = logs.status_id\
			WHERE logs.changed IN (SELECT MAX(changed) FROM user_status_logs logs GROUP BY user_id);', 
			[], true);
	}

	// SELECT users.*, status.name AS status, status.id AS status_id,
	// 			logs.changed AS status_changed
	// 		FROM users, user_status_logs AS logs, status
	// 		WHERE logs.changed IN (SELECT MAX(changed) FROM user_status_logs GROUP BY user_id)
	// 		AND users.id = logs.user_id AND logs.status_id = status.id;


	this.add = function (user) {
		var salt = bcrypt.genSaltSync(10);
		var hash = bcrypt.hashSync(user.password, salt);
		return db.query('INSERT INTO users(email, password) VALUES($1, $2) RETURNING id;', [user.email, hash]);
	}

	this.changeStatus = function (id, status) {
		return db.query(
			'INSERT INTO user_status_logs(user_id, status_id)\
			VALUES($1, (SELECT id FROM status WHERE name = $2))\
			RETURNING *', 
			[id, status]
		)
	}

	this.update = function (id, updatedFields) {
		var result = db.generateUpdateQuery.call(self, updatedFields, id);
		return db.query(result.queryString, result.values);
	}

	this.delete = function (id) {
		return db.query('DELETE FROM users WHERE id = $1;', [id]);
	}

	this.getHash = function (id) {
		if(typeof(id) === 'number') {
			return hashids.user.encode(id);
		}
		throw new Error('could not get user\'s hash');
	}

	this.getIdFromParams = function (params) {
		return params.user_id?
			+hashids.user.decode(params.user_id) :
			null;
	}

	this.getID = function (hash) {
		return +hashids.user.decode(hash);
	}

	this.getRegConfirmHash = function (userStatusRow) {
		if(userStatusRow.changed instanceof Date) {
			userStatusRow.changed = userStatusRow.changed.getTime();
			var hash = hashids.registration.encode( Object.values(userStatusRow) );
			return hash;
		}
		throw new Error('could not get registration hash')
	}

	this.decodeRegConfirmHash = (hash) => {
		var data = hashids.registration.decode(hash), statusLog = {};
		keys = ['user_id', 'status_id', 'changed'];
		if(typeof data === 'object') {
			keys.forEach((key, i) => statusLog[key] = data[i])
			return statusLog;
		}
		throw new Error('invalid registration confirmation hash')
	}

	this.compare = function (password, hash) {
		return bcrypt.compareSync(password, hash);
	}
	
}

module.exports = new User();
